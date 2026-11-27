import { exchangeObject, readExchangeJSON } from "./exchange-json";
import { recordGaps, currentRecordScope } from "./gaps";
import type { Session } from "./model";
import {
  fieldId,
  opaqueId,
  maxCollectionRequests,
  maxCollectionReceipts,
  type CollectionLink,
  type CollectionScope,
} from "./record-state";
import { applyRecordChanges } from "./session";
import {
  normalizeRecordValue,
  planRecordValues,
  workingDefinition,
  recordInputLimit,
} from "./source-record";
import { normalizeText, validStoredValue, type Control } from "./form";

const invalidRequest = "invalidCollectionRequest";
const invalidResponse = "invalidCollectionResponse";

type Question = {
  id: string;
  label: string;
  type: Control["kind"];
  required: boolean;
  instructions?: string;
  multiline?: boolean;
  allowBlankLines?: boolean;
  options?: { id: string; label: string }[];
};

export type CollectionRequest = {
  format: "veraflow-collection-request";
  version: 1;
  requestId: string;
  questions: Question[];
};

const questionTypes = new Set<unknown>([
  "text",
  "textarea",
  "email",
  "date",
  "number",
  "boolean",
  "radio",
  "dropdown",
]);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && !value.includes("\0");

export function readCollectionRequest(text: string): CollectionRequest {
  const root = exchangeObject(
    readExchangeJSON(text, recordInputLimit, invalidRequest),
    invalidRequest,
    ["format", "version", "requestId", "questions"],
  );
  if (
    root.format !== "veraflow-collection-request" ||
    root.version !== 1 ||
    !opaqueId(root.requestId) ||
    !Array.isArray(root.questions) ||
    !root.questions.length ||
    root.questions.length > 1000
  )
    throw Error(invalidRequest);
  const ids = new Set<string>();
  for (const item of root.questions) {
    const question = exchangeObject(item, invalidRequest, [
      "id",
      "label",
      "type",
      "required",
      "instructions",
      "multiline",
      "allowBlankLines",
      "options",
    ]);
    if (
      !fieldId(question.id) ||
      ids.has(question.id) ||
      !isText(question.label) ||
      !questionTypes.has(question.type) ||
      typeof question.required !== "boolean" ||
      (question.instructions !== undefined && !isText(question.instructions)) ||
      (question.multiline !== undefined &&
        (typeof question.multiline !== "boolean" ||
          !["text", "textarea"].includes(String(question.type)))) ||
      (question.allowBlankLines !== undefined &&
        (typeof question.allowBlankLines !== "boolean" ||
          !["text", "textarea"].includes(String(question.type)) ||
          (question.allowBlankLines && question.multiline !== true)))
    )
      throw Error(invalidRequest);
    ids.add(question.id);
    const choice = ["boolean", "radio", "dropdown"].includes(
      String(question.type),
    );
    if (!choice) {
      if (question.options !== undefined) throw Error(invalidRequest);
      continue;
    }
    if (
      !Array.isArray(question.options) ||
      !question.options.length ||
      question.options.length > 100
    )
      throw Error(invalidRequest);
    const options = new Set<string>();
    for (const item of question.options) {
      const option = exchangeObject(item, invalidRequest, ["id", "label"]);
      if (
        typeof option.id !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(option.id) ||
        options.has(option.id) ||
        !isText(option.label)
      )
        throw Error(invalidRequest);
      options.add(option.id);
    }
    if (
      question.type === "boolean" &&
      !(options.size === 2 && options.has("true") && options.has("false"))
    )
      throw Error(invalidRequest);
  }
  return root as CollectionRequest;
}

export async function sha256(text: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function recordRevision(s: Session) {
  // Project through the existing prefill definition so a draft and its saved
  // version agree on title, workflow and legacy verification defaults.
  return sha256(workingDefinition(s));
}

export function collectionQuestions(
  s: Session,
  scope: CollectionScope,
  booleanLabels: readonly [string, string] = ["Yes", "No"],
) {
  const gaps = recordGaps(s, scope);
  const needed = new Set([
    ...gaps.missingRequired,
    ...gaps.missingOptional,
    ...gaps.invalid,
  ]);
  const questions: Question[] = [];
  for (const field of gaps.fields) {
    if (!needed.has(field.id)) continue;
    const control = s.controls?.get(field.id);
    questions.push({
      id: field.id,
      label: control?.label?.trim() || field.id,
      type: control?.kind ?? "textarea",
      required:
        !control?.optional || gaps.unresolvedConditions.includes(field.id),
      instructions: control?.instructions,
      multiline:
        control?.multiline ?? (control === undefined ? true : undefined),
      allowBlankLines: control?.allowBlankLines,
      options:
        control?.options &&
        [...control.options.keys()].map((id) => ({
          id,
          label:
            control.kind === "boolean"
              ? booleanLabels[id === "true" ? 0 : 1]
              : control.optionLabels?.get(id)?.trim() || id,
        })),
    });
  }
  return { questions, gaps };
}

export async function prepareCollectionRequest(
  s: Session,
  scope: CollectionScope,
  questions: Question[],
) {
  if (!questions.length) throw Error("collectionNoQuestions");
  const requests = s.recordState?.requests ?? [];
  if (
    requests.length >= maxCollectionRequests &&
    !requests.some((request) => request.closed)
  )
    throw Error("collectionRequestLimit");
  const requestId = crypto.randomUUID();
  const request: CollectionRequest = {
    format: "veraflow-collection-request",
    version: 1,
    requestId,
    questions,
  };
  readCollectionRequest(JSON.stringify(request));
  const link: CollectionLink = {
    id: requestId,
    revision: await recordRevision(s),
    scope,
    questions: questions.map(({ id, required }) => [id, required]),
    applied: [],
  };
  return { request, link };
}

export function rememberCollection(s: Session, link: CollectionLink) {
  const state = (s.recordState ??= { version: 1 });
  const requests = (state.requests ??= []);
  if (requests.length >= maxCollectionRequests) {
    const oldestClosed = requests.findIndex((request) => request.closed);
    if (oldestClosed < 0) throw Error("collectionRequestLimit");
    requests.splice(oldestClosed, 1);
  }
  requests.push(link);
}

export function closeCollection(s: Session, requestId: string) {
  findCollection(s, requestId).closed = true;
}

function findCollection(s: Session, requestId: string) {
  const request = s.recordState?.requests?.find(({ id }) => id === requestId);
  if (!request) throw Error("collectionUnknown");
  return request;
}

export function readCollectionResponse(text: string) {
  const root = exchangeObject(
    readExchangeJSON(text, recordInputLimit, invalidResponse),
    invalidResponse,
    ["format", "version", "requestId", "responseId", "submittedAt", "fields"],
  );
  if (
    root.format !== "veraflow-collection-response" ||
    root.version !== 1 ||
    !opaqueId(root.requestId) ||
    !opaqueId(root.responseId) ||
    (root.submittedAt !== undefined &&
      (typeof root.submittedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
          root.submittedAt,
        ) ||
        !Number.isFinite(Date.parse(root.submittedAt)) ||
        new Date(root.submittedAt).toISOString() !== root.submittedAt))
  )
    throw Error(invalidResponse);
  const fields = new Map<string, string | null>();
  const entries = Object.entries(exchangeObject(root.fields, invalidResponse));
  if (entries.length > 1000) throw Error(invalidResponse);
  for (const [name, value] of entries) {
    if (!fieldId(name) || (value !== null && typeof value !== "string"))
      throw Error(invalidResponse);
    if (value?.includes("\0")) throw Error(invalidResponse);
    fields.set(name, value);
  }
  return { requestId: root.requestId, responseId: root.responseId, fields };
}

export function createCollectionResponse(
  request: CollectionRequest,
  answers: ReadonlyMap<string, string | null>,
) {
  const questions = new Map(
    request.questions.map((question) => [question.id, question]),
  );
  const fields = new Map<string, string | null>();
  for (const [id, value] of answers) {
    const question = questions.get(id);
    if (!question) throw Error("collectionUnexpected");
    const control: Control = {
      kind: question.type,
      optional: !question.required,
      multiline: question.multiline,
      allowBlankLines: question.allowBlankLines,
      options:
        question.options &&
        new Map(question.options.map(({ id, label }) => [id, label])),
    };
    const normalized = value === null ? null : normalizeText(control, value);
    if (question.required && !normalized?.trim())
      throw Error("collectionRequired");
    if (normalized !== null && !validStoredValue(control, normalized))
      throw Error("recordInvalidField:" + id);
    fields.set(id, normalized);
  }
  if (request.questions.some(({ id, required }) => required && !fields.has(id)))
    throw Error("collectionRequired");
  const response = {
    format: "veraflow-collection-response" as const,
    version: 1 as const,
    requestId: request.requestId,
    responseId: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    fields: Object.fromEntries(fields),
  };
  readCollectionResponse(JSON.stringify(response));
  return response;
}

export async function reviewCollectionResponse(
  s: Session,
  response: ReturnType<typeof readCollectionResponse>,
) {
  const request = findCollection(s, response.requestId);
  if (request.applied.includes(response.responseId))
    return { status: "duplicate" as const };
  if (request.closed) throw Error("collectionClosed");
  if (request.applied.length >= maxCollectionReceipts)
    throw Error("collectionResponseLimit");
  if (request.revision !== (await recordRevision(s)))
    throw Error("collectionStale");
  const allowed = new Map(request.questions);
  const next = new Map<string, string | null>();
  for (const [id, value] of response.fields) {
    if (!allowed.has(id)) throw Error("collectionUnexpected");
    if (allowed.get(id) && !value?.trim()) throw Error("collectionRequired");
    next.set(id, normalizeRecordValue(s, id, value));
    if (allowed.get(id) && !next.get(id)?.trim())
      throw Error("collectionRequired");
  }
  for (const [id, required] of allowed)
    if (required && !next.has(id)) throw Error("collectionRequired");

  const current = recordGaps(s, request.scope);
  const proposed = recordGaps(s, request.scope, next);
  const hidden = (gaps: ReturnType<typeof recordGaps>) =>
    new Set([...gaps.inapplicable, ...gaps.deferred]);
  const before = hidden(current);
  const after = hidden(proposed);
  for (const id of next.keys())
    if (before.has(id) || after.has(id)) throw Error("collectionInapplicable");
  const changes = planRecordValues(s, next);
  const matching = [...next.keys()].filter(
    (id) => !changes.some((change) => s.fields[change.index].name === id),
  );
  return { status: "review" as const, request, changes, matching };
}

export async function applyCollectionResponse(
  s: Session,
  response: ReturnType<typeof readCollectionResponse>,
  accepted: ReadonlySet<string>,
) {
  const review = await reviewCollectionResponse(s, response);
  if (review.status === "duplicate") return review.status;
  const changes = review.changes.filter(({ index }) =>
    accepted.has(s.fields[index].name),
  );
  // A partial acceptance can leave a different branch active than the full proposal.
  const proposed = recordGaps(
    s,
    review.request.scope,
    new Map(changes.map(({ index, value }) => [s.fields[index].name, value])),
  );
  const hidden = new Set([...proposed.inapplicable, ...proposed.deferred]);
  if (changes.some(({ index }) => hidden.has(s.fields[index].name)))
    throw Error("collectionInapplicable");
  if (changes.length)
    applyRecordChanges(s, changes, {
      source: "collection",
      requestId: response.requestId,
      responseId: response.responseId,
    });
  review.request.applied.push(response.responseId);
  return "applied";
}
