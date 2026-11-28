import { sha256 } from "../core/collection";
import {
  associateQuestionnaire,
  changeExecution,
  closeQuestionnaire,
  createInstance,
  findInstance,
  ingestResponse,
  registerWorkflow,
  requestQuestionnaire,
  resolveResponse,
  setPaused,
  supplyValues,
  verifyValue,
} from "./engine";
import { collectionProvider } from "./provider";
import { readWorkflow } from "./spec";
import { processAlive, type WorkflowDatabase } from "./store";
import { validateDestination } from "./destination";

export function workflowStatus(db: WorkflowDatabase) {
  const state = db.read();
  return {
    format: "veraflow-workflow-status",
    version: 1,
    stopped: state.stopped,
    worker:
      state.worker && processAlive(state.worker.pid)
        ? { started: state.worker.started }
        : null,
    inboxError: state.inboxError,
    definitions: state.definitions.map(({ workflow, paused }) => ({
      id: workflow.id,
      title: workflow.title,
      revision: workflow.revision,
      provider: workflow.collection.provider,
      paused,
    })),
    instances: state.instances.map(
      ({ form: _form, record: _record, receipts, requests, ...instance }) => ({
        ...instance,
        requests: requests.map(
          ({ request, provider, respondentUrl, closed }) => ({
            id: request.requestId,
            provider,
            respondentUrl,
            closed,
          }),
        ),
        responses: receipts.map(({ id, requestId, disposition }) => ({
          id,
          requestId,
          disposition,
        })),
      }),
    ),
    inbox: state.inbox.slice(-100).reverse(),
  };
}

export async function workflowAction(
  db: WorkflowDatabase,
  action: string,
  args: Record<string, unknown>,
) {
  const text = (name: string) => {
    if (typeof args[name] !== "string" || !args[name])
      throw Error("workflowMissingArgument");
    return args[name] as string;
  };
  const flag = (name: string) => {
    if (typeof args[name] !== "boolean") throw Error("workflowMissingArgument");
    return args[name] as boolean;
  };
  switch (action) {
    case "add": {
      const workflow = readWorkflow(text("workflow"), true);
      validateDestination(workflow.destination);
      await db.update((state) =>
        registerWorkflow(state, workflow, text("form")),
      );
      return { id: workflow.id, revision: workflow.revision };
    }
    case "create":
      return db.update(async (state) => {
        const { id, revision } = await createInstance(
          state,
          text("id"),
          args.revision === undefined ? undefined : text("revision"),
          args.source === undefined ? undefined : text("source"),
        );
        return { id, revision };
      });
    case "request":
      return db.update(async (state) => {
        const id = text("id");
        const request = await requestQuestionnaire(state, id);
        const provider = findInstance(state, id).requests.at(-1)!.provider;
        return collectionProvider(provider).handoff(request);
      });
    case "request-inspect": {
      const round = findInstance(db.read(), text("id")).requests.find(
        ({ request }) => request.requestId === text("requestId"),
      );
      if (!round) throw Error("collectionUnknown");
      return collectionProvider(round.provider).handoff(round.request);
    }
    case "link":
      await db.update((state) =>
        associateQuestionnaire(
          state,
          text("id"),
          text("requestId"),
          text("url"),
        ),
      );
      return { ok: true };
    case "close":
      await db.update((state) =>
        closeQuestionnaire(state, text("id"), text("requestId")),
      );
      return { ok: true };
    case "import": {
      if (typeof args.response !== "string")
        throw Error("workflowMissingArgument");
      const response = args.response;
      const key = await sha256(response);
      return db.update((state) =>
        ingestResponse(state, response, "Manual import", key),
      );
    }
    case "values":
      await db.update((state) =>
        supplyValues(state, text("id"), text("source")),
      );
      return { ok: true };
    case "verify":
      return {
        matched: await db.update((state) =>
          verifyValue(state, text("id"), text("field"), text("candidate")),
        ),
      };
    case "resolve":
      await db.update((state) =>
        resolveResponse(
          state,
          text("id"),
          text("responseId"),
          text("decision"),
        ),
      );
      return { ok: true };
    case "execution":
      return db.update((state) => {
        const { id, state: status } = changeExecution(
          state,
          text("id"),
          text("transition"),
          args.acknowledge === true,
        );
        return { id, state: status };
      });
    case "pause":
      await db.update((state) => setPaused(state, text("id"), flag("enabled")));
      return { ok: true };
    case "stop":
      await db.update((state) => {
        state.stopped = flag("enabled");
      });
      return { ok: true };
    case "record": {
      const record = findInstance(db.read(), text("id")).record;
      if (!record) throw Error("recordNotReady");
      return record;
    }
    case "record-working":
      return { form: findInstance(db.read(), text("id")).form };
    case "response-inspect": {
      const receipt = findInstance(db.read(), text("id")).receipts.find(
        ({ id }) => id === text("responseId"),
      );
      if (!receipt?.pendingText) throw Error("workflowConflictNotFound");
      return { response: JSON.parse(receipt.pendingText) as unknown };
    }
    default:
      throw Error("workflowUnknownAction");
  }
}
