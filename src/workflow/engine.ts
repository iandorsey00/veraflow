import {
  applyCollectionResponse,
  closeCollection,
  collectionQuestions,
  prepareCollectionRequest,
  readCollectionResponse,
  rememberCollection,
  reviewCollectionResponse,
  sha256,
  type CollectionRequest,
} from "../core/collection";
import { recordGaps } from "../core/gaps";
import {
  applyTransformations,
  mapSourceRecord,
  planTransformations,
  validatedRecord,
} from "../core/interoperability";
import { recordHistory } from "../core/record-state";
import { applyRecordChanges, setFieldOrigin, verify } from "../core/session";
import {
  normalizeRecordValue,
  planRecordValues,
  prefilledContent,
  readRecordInput,
} from "../core/source-record";
import type { Session } from "../core/model";
import { collectionProvider } from "./provider";
import { workflowSession, type Workflow, validateWorkflowForm } from "./spec";

export type WorkflowState =
  | "awaiting-response"
  | "needs-attention"
  | "ready"
  | "queued"
  | "running"
  | "autofilled"
  | "failed"
  | "uncertain"
  | "cancelled"
  | "completed";
type Issue = { code: string; fields?: string[] };
type PageReport = { checked: string[]; mismatches: string[] };

export type Attempt = {
  id: string;
  owner: string;
  started: string;
  finished?: string;
  result?: "autofilled" | "retry" | "failed" | "uncertain";
  issue?: Issue;
  report?: PageReport;
};

type Definition = {
  workflow: Workflow;
  form: string;
  paused: boolean;
};
type Round = {
  request: CollectionRequest;
  provider: string;
  respondentUrl?: string;
  closed?: true;
};
export type Receipt = {
  id: string;
  requestId: string;
  digest: string;
  disposition: "accepted" | "conflict" | "kept";
  pendingText?: string;
};
export type Instance = {
  id: string;
  workflowId: string;
  revision: string;
  created: string;
  form: string;
  requests: Round[];
  receipts: Receipt[];
  state: WorkflowState;
  issues: Issue[];
  attempts: Attempt[];
  retryFrom: number;
  nextRun?: string;
  record?: Awaited<ReturnType<typeof validatedRecord>>;
  activity: { at: string; code: string; fields?: string[] }[];
};

export type InboxEntry = {
  key: string;
  file: string;
  at: string;
  status: "accepted" | "duplicate" | "quarantined" | "conflict";
  code?: string;
  instanceId?: string;
  responseId?: string;
};
export type WorkflowStore = {
  format: "veraflow-workflow-store";
  version: 1;
  stopped: boolean;
  definitions: Definition[];
  instances: Instance[];
  inbox: InboxEntry[];
  inboxError?: string;
  worker?: { id: string; pid: number; started: string };
};

const now = () => new Date().toISOString();
const terminal = new Set<WorkflowState>(["completed", "cancelled"]);
const frozen = new Set<WorkflowState>([
  "running",
  "autofilled",
  "uncertain",
  ...terminal,
]);
const event = (instance: Instance, code: string, fields?: string[]) => {
  instance.activity.push({ at: now(), code, ...(fields ? { fields } : {}) });
};
export function emptyStore(): WorkflowStore {
  return {
    format: "veraflow-workflow-store",
    version: 1,
    stopped: false,
    definitions: [],
    instances: [],
    inbox: [],
  };
}

export function definition(
  store: WorkflowStore,
  id: string,
  revision?: string,
) {
  const found = store.definitions
    .filter(
      ({ workflow }) =>
        workflow.id === id &&
        (revision === undefined || workflow.revision === revision),
    )
    .at(-1);
  if (!found) throw Error("workflowDefinitionNotFound");
  return found;
}

export function findInstance(store: WorkflowStore, id: string) {
  const instance = store.instances.find((entry) => entry.id === id);
  if (!instance) throw Error("workflowInstanceNotFound");
  return instance;
}

export function registerWorkflow(
  store: WorkflowStore,
  workflow: Workflow,
  form: string,
) {
  if (
    store.definitions.some(
      ({ workflow: saved }) =>
        saved.id === workflow.id && saved.revision === workflow.revision,
    )
  )
    throw Error("workflowRevisionExists");
  collectionProvider(workflow.collection.provider);
  validateWorkflowForm(workflow, form);
  store.definitions.push({
    workflow,
    form,
    paused: store.definitions.some(
      (entry) => entry.workflow.id === workflow.id && entry.paused,
    ),
  });
}

function joined(store: WorkflowStore, id: string, writable = true) {
  const instance = findInstance(store, id);
  if (writable && frozen.has(instance.state))
    throw Error("workflowInstanceLocked");
  const { workflow } = definition(
    store,
    instance.workflowId,
    instance.revision,
  );
  return {
    instance,
    workflow,
    session: workflowSession(workflow, instance.form, instance.created),
  };
}

function transform(workflow: Workflow, session: Session) {
  const applicable = new Set(recordGaps(session, workflow.scope).known);
  const fields = Object.entries(workflow.transformations ?? {}).filter(
    ([id, rule]) =>
      applicable.has(id) &&
      session.fields.some(
        (field) => field.name === id && field.value === rule.from,
      ),
  );
  if (!fields.length) return [];
  const changes = planTransformations(
    session,
    JSON.stringify({
      format: "veraflow-transformations",
      version: 1,
      fields: Object.fromEntries(fields),
    }),
  );
  applyTransformations(session, changes);
  return fields.map(([id]) => id);
}

async function reevaluate(
  instance: Instance,
  workflow: Workflow,
  session: Session,
) {
  const previous = {
    fingerprint: instance.record?.fingerprint,
    state: instance.state,
    issues: instance.issues,
    nextRun: instance.nextRun,
  };
  instance.form = prefilledContent(session);
  instance.issues = [];
  delete instance.record;
  delete instance.nextRun;
  const gaps = recordGaps(session, workflow.scope);
  const report = (code: string, fields: string[]) => {
    if (fields.length) instance.issues.push({ code, fields });
  };
  report("missingFields", gaps.missingRequired);
  report("invalidFields", gaps.invalid);
  report("unresolvedConditions", gaps.unresolvedConditions);
  report("verificationRequired", gaps.pendingVerification);
  if (instance.receipts.some(({ disposition }) => disposition === "conflict"))
    instance.issues.push({ code: "conflictingResponse" });
  if (instance.issues.length) {
    const waiting = session.recordState?.requests?.some(
      ({ closed, applied, questions }) =>
        !closed &&
        !applied.length &&
        questions.some(
          ([id]) =>
            gaps.missingRequired.includes(id) ||
            gaps.unresolvedConditions.includes(id) ||
            gaps.invalid.includes(id),
        ),
    );
    instance.state =
      waiting &&
      instance.issues.every(({ code }) =>
        ["missingFields", "unresolvedConditions", "invalidFields"].includes(
          code,
        ),
      )
        ? "awaiting-response"
        : "needs-attention";
    return;
  }
  try {
    instance.record = await validatedRecord(session, workflow.scope, true);
  } catch {
    instance.state = "needs-attention";
    instance.issues.push({ code: "recordValidationFailed" });
    return;
  }
  if (
    previous.fingerprint === instance.record.fingerprint &&
    (previous.state === "queued" || previous.state === "failed")
  ) {
    instance.state = previous.state;
    instance.issues = previous.issues;
    instance.nextRun = previous.nextRun;
    return;
  }
  instance.retryFrom = instance.attempts.length;
  instance.state =
    workflow.policy.autofill === "automatic" ? "queued" : "ready";
}

function planSuppliedValues(
  session: Session,
  values: ReadonlyMap<string, string | null>,
) {
  const changes = planRecordValues(session, values);
  // When a person explicitly supplies a value identical to a default, retain
  // the evidence of where it came from even though the text did not change.
  session.fields.forEach((field, index) => {
    if (
      !values.has(field.name) ||
      (field.recordInput &&
        recordHistory(session.recordState, field.name)?.origin.source !==
          "default") ||
      field.value === null ||
      field.value !== session.controls?.get(field.name)?.defaultValue
    )
      return;
    const value = normalizeRecordValue(
      session,
      field.name,
      values.get(field.name)!,
    );
    if (value === field.value)
      changes.push({ index, previous: field.value, value });
  });
  return changes;
}

export async function createInstance(
  store: WorkflowStore,
  id: string,
  revision?: string,
  source?: string,
) {
  const { workflow, form } = definition(store, id, revision);
  const created = now();
  const session = workflowSession(workflow, form, created);
  if (workflow.policy.defaults === "confirm") {
    applyRecordChanges(
      session,
      session.fields.flatMap((field, index) =>
        session.controls?.get(field.name)?.defaultValue !== undefined
          ? [{ index, value: null }]
          : [],
      ),
    );
  } else {
    for (const field of session.fields)
      if (
        field.value !== null &&
        session.controls?.get(field.name)?.defaultValue === field.value
      )
        setFieldOrigin(session, field.name, { source: "default" });
  }
  if (source !== undefined) {
    const values = workflow.sourceMapping
      ? mapSourceRecord(source, JSON.stringify(workflow.sourceMapping))
      : readRecordInput(source);
    applyRecordChanges(session, planSuppliedValues(session, values), {
      source: workflow.sourceMapping ? "mapped" : "json",
    });
  }
  const instance: Instance = {
    id: crypto.randomUUID(),
    workflowId: id,
    revision: workflow.revision,
    created,
    form,
    requests: [],
    receipts: [],
    state: "needs-attention",
    issues: [],
    attempts: [],
    retryFrom: 0,
    activity: [],
  };
  event(instance, "created");
  const transformed = transform(workflow, session);
  if (transformed.length) event(instance, "transformed", transformed);
  await reevaluate(instance, workflow, session);
  store.instances.push(instance);
  return instance;
}

export async function requestQuestionnaire(store: WorkflowStore, id: string) {
  const { instance, workflow, session } = joined(store, id);
  const { questions } = collectionQuestions(session, workflow.scope);
  const { request, link } = await prepareCollectionRequest(
    session,
    workflow.scope,
    questions,
  );
  rememberCollection(session, link);
  instance.requests.push({ request, provider: workflow.collection.provider });
  await reevaluate(instance, workflow, session);
  event(instance, "questionnairePrepared");
  return request;
}

export function associateQuestionnaire(
  store: WorkflowStore,
  id: string,
  requestId: string,
  respondentUrl: string,
) {
  const { instance } = joined(store, id);
  const round = instance.requests.find(
    ({ request }) => request.requestId === requestId,
  );
  if (!round) throw Error("collectionUnknown");
  if (round.closed) throw Error("collectionClosed");
  round.respondentUrl = collectionProvider(round.provider).respondentLink(
    respondentUrl,
  );
  event(instance, "questionnaireAssociated");
}

export async function closeQuestionnaire(
  store: WorkflowStore,
  id: string,
  requestId: string,
) {
  const { instance, workflow, session } = joined(store, id, false);
  if (instance.state === "running") throw Error("workflowInstanceLocked");
  if (
    instance.receipts.some(
      (receipt) =>
        receipt.requestId === requestId && receipt.disposition === "conflict",
    )
  )
    throw Error("workflowRequestHasConflict");
  closeCollection(session, requestId);
  const round = instance.requests.find(
    ({ request }) => request.requestId === requestId,
  );
  if (round) round.closed = true;
  if (frozen.has(instance.state)) instance.form = prefilledContent(session);
  else await reevaluate(instance, workflow, session);
  event(instance, "questionnaireClosed");
}

const responseProblems = new Set([
  "invalidCollectionResponse",
  "collectionUnknown",
  "collectionClosed",
  "collectionResponseLimit",
  "collectionStale",
  "collectionUnexpected",
  "collectionRequired",
  "collectionInapplicable",
  "recordInvalidField",
  "workflowInstanceLocked",
  "responseIdReused",
]);

function safeResponseCode(error: unknown) {
  const code = error instanceof Error ? error.message.split(":")[0] : "";
  if (responseProblems.has(code)) return code;
  throw error;
}

export async function ingestResponse(
  store: WorkflowStore,
  text: string,
  file: string,
  key: string,
) {
  const entry: InboxEntry = { key, file, at: now(), status: "quarantined" };
  let sessionRecord: Session | undefined;
  let target: Instance | undefined;
  let workflow: Workflow | undefined;
  let transformed: string[] = [];
  try {
    const response = readCollectionResponse(text);
    entry.responseId = response.responseId;
    target = store.instances.find(({ requests }) =>
      requests.some(({ request }) => request.requestId === response.requestId),
    );
    if (!target) throw Error("collectionUnknown");
    entry.instanceId = target.id;
    const digest = await sha256(
      JSON.stringify([
        response.requestId,
        [...response.fields].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ]),
    );
    const existing = store.instances
      .flatMap(({ receipts }) => receipts)
      .find(({ id }) => id === response.responseId);
    if (existing) {
      if (existing.digest !== digest) throw Error("responseIdReused");
      entry.status = "duplicate";
    } else {
      ({ session: sessionRecord, workflow } = joined(store, target.id));
      const receipt: Receipt = {
        id: response.responseId,
        requestId: response.requestId,
        digest,
        disposition: "accepted",
      };
      const review = await reviewCollectionResponse(sessionRecord, response);
      if (review.status === "duplicate") entry.status = "duplicate";
      else {
        const changes = review.changes.filter(({ index, value }) => {
          const field = sessionRecord!.fields[index];
          return (
            recordHistory(sessionRecord!.recordState, field.name)
              ?.transformations?.[0]?.from !== value
          );
        });
        const conflicts = changes.filter(({ previous }) => previous !== null);
        if (conflicts.length) {
          receipt.disposition = "conflict";
          receipt.pendingText = text;
          entry.status = "conflict";
          event(
            target,
            "conflictingResponse",
            conflicts.map(({ index }) => sessionRecord!.fields[index].name),
          );
        } else {
          await applyCollectionResponse(
            sessionRecord,
            response,
            new Set(
              changes.map(({ index }) => sessionRecord!.fields[index].name),
            ),
          );
          transformed = transform(workflow, sessionRecord);
          entry.status = "accepted";
          event(target, "responseApplied");
        }
        target.receipts.push(receipt);
      }
    }
  } catch (error) {
    entry.code = safeResponseCode(error);
  }
  if (
    target &&
    workflow &&
    sessionRecord &&
    ["conflict", "accepted"].includes(entry.status)
  ) {
    if (transformed.length) event(target, "transformed", transformed);
    await reevaluate(target, workflow, sessionRecord);
  }
  // Keep the latest result for this file fingerprint. Originals stay in the inbox.
  store.inbox = store.inbox.filter((item) => item.key !== key);
  store.inbox.push(entry);
  return entry;
}

export async function resolveResponse(
  store: WorkflowStore,
  id: string,
  responseId: string,
  decision: string,
) {
  const { instance, workflow, session } = joined(store, id);
  const receipt = instance.receipts.find(
    (item) => item.id === responseId && item.disposition === "conflict",
  );
  if (!receipt || !receipt.pendingText) throw Error("workflowConflictNotFound");
  if (decision !== "accept" && decision !== "keep")
    throw Error("workflowConflictDecision");
  if (decision === "accept") {
    const response = readCollectionResponse(receipt.pendingText);
    const accepted = new Set(
      [...response.fields]
        .filter(
          ([field, value]) =>
            recordHistory(session.recordState, field)?.transformations?.[0]
              ?.from !== value,
        )
        .map(([field]) => field),
    );
    await applyCollectionResponse(session, response, accepted);
    const transformed = transform(workflow, session);
    if (transformed.length) event(instance, "transformed", transformed);
  }
  receipt.disposition = decision === "accept" ? "accepted" : "kept";
  delete receipt.pendingText;
  event(instance, decision === "accept" ? "conflictAccepted" : "conflictKept");
  await reevaluate(instance, workflow, session);
}

export async function supplyValues(
  store: WorkflowStore,
  id: string,
  text: string,
) {
  const { instance, workflow, session } = joined(store, id);
  const changes = planSuppliedValues(session, readRecordInput(text));
  applyRecordChanges(session, changes, { source: "manual" });
  const transformed = transform(workflow, session);
  event(
    instance,
    "valuesSupplied",
    changes.map(({ index }) => session.fields[index].name),
  );
  if (transformed.length) event(instance, "transformed", transformed);
  await reevaluate(instance, workflow, session);
}

export async function verifyValue(
  store: WorkflowStore,
  id: string,
  field: string,
  candidate: string,
) {
  const { instance, workflow, session } = joined(store, id);
  if (!recordGaps(session, workflow.scope).pendingVerification.includes(field))
    throw Error("workflowVerificationNotPending");
  session.active = session.fields.findIndex(({ name }) => name === field);
  session.mode = "verify";
  const matched = verify(session, candidate, false);
  event(instance, matched ? "verificationMatched" : "verificationMismatch", [
    field,
  ]);
  if (matched) await reevaluate(instance, workflow, session);
  return matched;
}

export function changeExecution(
  store: WorkflowStore,
  id: string,
  action: string,
  acknowledge = false,
) {
  const instance = findInstance(store, id);
  if (action === "queue" && instance.state === "ready")
    instance.state = "queued";
  else if (action === "complete" && instance.state === "autofilled")
    instance.state = "completed";
  else if (
    action === "cancel" &&
    !terminal.has(instance.state) &&
    instance.state !== "running"
  )
    instance.state = "cancelled";
  else if (
    action === "retry" &&
    instance.record &&
    (instance.state === "failed" ||
      (["uncertain", "autofilled"].includes(instance.state) && acknowledge))
  ) {
    instance.retryFrom = instance.attempts.length;
    instance.state = "queued";
    instance.issues = [];
    delete instance.nextRun;
  } else throw Error("workflowInvalidTransition");
  event(instance, action);
  return instance;
}

export function setPaused(store: WorkflowStore, id: string, paused: boolean) {
  definition(store, id);
  for (const entry of store.definitions)
    if (entry.workflow.id === id) entry.paused = paused;
}

export function claimExecution(
  store: WorkflowStore,
  owner: string,
  time = now(),
) {
  if (store.stopped || store.inboxError || store.worker?.id !== owner)
    return null;
  const instance = store.instances.find(
    (entry) =>
      entry.state === "queued" &&
      (!entry.nextRun || entry.nextRun <= time) &&
      !definition(store, entry.workflowId, entry.revision).paused,
  );
  if (!instance) return null;
  if (!instance.record) throw Error("workflowMissingValidatedRecord");
  const attempt: Attempt = { id: crypto.randomUUID(), owner, started: time };
  instance.state = "running";
  instance.attempts.push(attempt);
  event(instance, "executionStarted");
  const { workflow } = definition(
    store,
    instance.workflowId,
    instance.revision,
  );
  return {
    instanceId: instance.id,
    attemptId: attempt.id,
    destination: workflow.destination,
    record: instance.record,
  };
}

export type Claim = NonNullable<ReturnType<typeof claimExecution>>;
export type Outcome =
  | { kind: "autofilled"; report: PageReport }
  | {
      kind: "transient" | "failed" | "uncertain";
      issue: Issue;
      report?: PageReport;
    };

export function finishExecution(
  store: WorkflowStore,
  claim: Pick<Claim, "instanceId" | "attemptId">,
  outcome: Outcome,
  time = now(),
) {
  const instance = findInstance(store, claim.instanceId);
  const attempt = instance.attempts.at(-1);
  if (instance.state !== "running" || attempt?.id !== claim.attemptId)
    throw Error("workflowAttemptStale");
  attempt.finished = time;
  attempt.report = outcome.report;
  if (outcome.kind === "autofilled") {
    instance.state = attempt.result = "autofilled";
    instance.issues = [];
  } else {
    const max = definition(store, instance.workflowId, instance.revision)
      .workflow.policy.maxAttempts;
    const count = instance.attempts.length - instance.retryFrom;
    attempt.issue = outcome.issue;
    instance.issues = [outcome.issue];
    if (outcome.kind === "transient" && count < max) {
      attempt.result = "retry";
      instance.state = "queued";
      instance.nextRun = new Date(
        Date.parse(time) + 5000 * 2 ** (count - 1),
      ).toISOString();
    } else
      instance.state = attempt.result =
        outcome.kind === "uncertain" ? "uncertain" : "failed";
  }
  event(instance, attempt.result);
}

export function acquireWorker(
  store: WorkflowStore,
  id: string,
  alive: (pid: number) => boolean,
) {
  if (store.worker && alive(store.worker.pid))
    throw Error("workflowWorkerAlreadyRunning");
  for (const instance of store.instances) {
    if (instance.state !== "running") continue;
    finishExecution(
      store,
      {
        instanceId: instance.id,
        attemptId: instance.attempts.at(-1)!.id,
      },
      { kind: "uncertain", issue: { code: "executionInterrupted" } },
    );
  }
  store.worker = { id, pid: process.pid, started: now() };
}
