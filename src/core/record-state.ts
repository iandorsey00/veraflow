import { exchangeObject } from "./exchange-json";

const error = "invalidRecordState";
export const maxCollectionRequests = 32;
export const maxCollectionReceipts = 32;

export type CollectionScope = { outputId: string } | { step: number | null };

export type CollectionLink = {
  id: string;
  revision: string;
  scope: CollectionScope;
  questions: [id: string, required: boolean][];
  applied: string[];
  closed?: true;
};

const origins = [
  "manual",
  "json",
  "csv",
  "mapped",
  "candidate",
  "capture",
  "default",
  "collection",
  "transformation",
] as const;
export type RecordOrigin = {
  source: (typeof origins)[number];
  requestId?: string;
  responseId?: string;
};
export type FieldHistory = {
  origin: RecordOrigin;
  transformations?: { kind: string; from: string; to: string }[];
};
export type RecordState = {
  version: 1;
  requests?: CollectionLink[];
  history?: Record<string, FieldHistory>;
};

export const opaqueId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
export const fieldId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 1024 &&
  !!value.trim() &&
  !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value);

export function readScope(value: unknown): CollectionScope {
  const raw = exchangeObject(value, error, ["step", "outputId"]);
  if (Object.keys(raw).length !== 1) throw Error(error);
  if (
    typeof raw.outputId === "string" &&
    /^[A-Za-z0-9_-]{1,1024}$/.test(raw.outputId)
  )
    return { outputId: raw.outputId };
  if (
    raw.step === null ||
    (Number.isInteger(raw.step) && Number(raw.step) >= 0)
  )
    return { step: raw.step as number | null };
  throw Error(error);
}

export function readRecordState(value: unknown): RecordState {
  const raw = exchangeObject(value, error, ["version", "requests", "history"]);
  if (raw.version !== 1) throw Error(error);
  const state: RecordState = { version: 1 };
  if (raw.requests !== undefined) {
    if (
      !Array.isArray(raw.requests) ||
      raw.requests.length > maxCollectionRequests
    )
      throw Error(error);
    const ids = new Set<string>();
    state.requests = raw.requests.map((item: unknown) => {
      const req = exchangeObject(item, error, [
        "id",
        "revision",
        "scope",
        "questions",
        "applied",
        "closed",
      ]);
      if (
        !opaqueId(req.id) ||
        ids.has(req.id) ||
        typeof req.revision !== "string" ||
        !/^[a-f0-9]{64}$/.test(req.revision) ||
        (req.closed !== undefined && req.closed !== true) ||
        !Array.isArray(req.questions) ||
        req.questions.length < 1 ||
        req.questions.length > 1000 ||
        !Array.isArray(req.applied) ||
        req.applied.length > maxCollectionReceipts ||
        !req.applied.every(opaqueId) ||
        new Set(req.applied).size !== req.applied.length
      )
        throw Error(error);
      ids.add(req.id);
      const fields = new Set<string>();
      const questions = req.questions.map(
        (entry: unknown): [string, boolean] => {
          if (
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            !fieldId(entry[0]) ||
            fields.has(entry[0]) ||
            typeof entry[1] !== "boolean"
          )
            throw Error(error);
          fields.add(entry[0]);
          return [entry[0], entry[1]];
        },
      );
      return {
        id: req.id,
        revision: req.revision,
        scope: readScope(req.scope),
        questions,
        applied: req.applied,
        ...(req.closed ? { closed: true as const } : {}),
      };
    });
  }
  if (raw.history !== undefined) {
    const entries = Object.entries(exchangeObject(raw.history, error));
    if (entries.length > 1000) throw Error(error);
    state.history = Object.fromEntries(
      entries.map(([name, item]) => {
        if (!fieldId(name)) throw Error(error);
        const metadata = exchangeObject(item, error, [
          "origin",
          "transformations",
        ]);
        const origin = exchangeObject(metadata.origin, error, [
          "source",
          "requestId",
          "responseId",
        ]);
        if (
          !origins.includes(origin.source as RecordOrigin["source"]) ||
          (origin.requestId !== undefined && !opaqueId(origin.requestId)) ||
          (origin.responseId !== undefined && !opaqueId(origin.responseId))
        )
          throw Error(error);
        const transformations: FieldHistory["transformations"] = [];
        if (metadata.transformations !== undefined) {
          if (
            !Array.isArray(metadata.transformations) ||
            metadata.transformations.length > 8
          )
            throw Error(error);
          for (const item of metadata.transformations) {
            const change = exchangeObject(item, error, ["kind", "from", "to"]);
            if (
              typeof change.kind !== "string" ||
              !/^[a-z][a-z0-9_-]{0,63}$/.test(change.kind) ||
              typeof change.from !== "string" ||
              typeof change.to !== "string" ||
              change.from.includes("\0") ||
              change.to.includes("\0")
            )
              throw Error(error);
            transformations.push({
              kind: change.kind,
              from: change.from,
              to: change.to,
            });
          }
        }
        return [
          name,
          {
            origin: origin as RecordOrigin,
            ...(transformations.length ? { transformations } : {}),
          },
        ];
      }),
    );
  }
  return state;
}

export function recordHistory(state: RecordState | undefined, name: string) {
  const history = state?.history;
  return history && Object.hasOwn(history, name) ? history[name] : undefined;
}
