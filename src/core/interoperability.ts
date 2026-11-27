import { sha256, recordRevision } from "./collection";
import { exchangeObject, readExchangeJSON } from "./exchange-json";
import { currentRecordScope, recordGaps } from "./gaps";
import type { Session } from "./model";
import {
  fieldId,
  readRecordState,
  readScope,
  recordHistory,
  type CollectionScope,
} from "./record-state";
import {
  activateFormStep,
  applyRecordChanges,
  prepareSections,
  spreadsheetRow,
} from "./session";
import { parseSource } from "./source";
import {
  planRecordValues,
  recordInputLimit,
  recordValues,
} from "./source-record";

const mappingError = "invalidRecordMapping";
const transformationError = "invalidTransformation";
const reviewedError = "invalidReviewedRecord";
const path = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 12 || !value.every(fieldId))
    throw Error(mappingError);
  return value;
};

function at(value: unknown, path: readonly string[]) {
  for (const part of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part))
      return undefined;
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(part))
      return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function scalar(value: unknown): value is string | boolean | number | null {
  return (
    value === null ||
    (typeof value === "string" && !value.includes("\0")) ||
    typeof value === "boolean" ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value)))
  );
}

export function mapSourceRecord(sourceText: string, mappingText: string) {
  const root = readExchangeJSON(sourceText, recordInputLimit, mappingError);
  const mapping = exchangeObject(
    readExchangeJSON(mappingText, recordInputLimit, mappingError),
    mappingError,
    ["format", "version", "fields"],
  );
  if (mapping.format !== "veraflow-record-mapping" || mapping.version !== 1)
    throw Error(mappingError);
  const rules = Object.entries(exchangeObject(mapping.fields, mappingError));
  if (!rules.length || rules.length > 1000) throw Error(mappingError);
  const result = new Map<string, string | null>();
  for (const [name, raw] of rules) {
    if (!fieldId(name)) throw Error(mappingError);
    const rule = exchangeObject(raw, mappingError, [
      "path",
      "select",
      "required",
      "values",
    ]);
    if (rule.required !== undefined && typeof rule.required !== "boolean")
      throw Error(mappingError);
    let source: unknown = root;
    if (rule.select !== undefined) {
      const selection = exchangeObject(rule.select, mappingError, [
        "path",
        "where",
      ]);
      const where = Object.entries(
        exchangeObject(selection.where, mappingError),
      );
      if (
        !where.length ||
        where.length > 16 ||
        !where.every(([key, value]) => fieldId(key) && scalar(value))
      )
        throw Error(mappingError);
      const candidates = at(root, path(selection.path));
      if (candidates !== undefined && !Array.isArray(candidates))
        throw Error(mappingError);
      const matches =
        candidates?.filter((entry: unknown) =>
          where.every(([key, expected]) => at(entry, [key]) === expected),
        ) ?? [];
      if (matches.length > 1) throw Error("recordMappingAmbiguous");
      source = matches[0];
    }
    const conversions =
      rule.values === undefined
        ? undefined
        : exchangeObject(rule.values, mappingError);
    if (conversions && !Object.values(conversions).every(scalar))
      throw Error(mappingError);
    let value = at(source, path(rule.path));
    if (value === undefined) {
      if (rule.required) throw Error("recordMappingMissing");
      continue;
    }
    if (!scalar(value)) throw Error(mappingError);
    if (conversions && value !== null) {
      const key = String(value);
      if (!Object.hasOwn(conversions, key))
        throw Error("recordMappingConversion");
      value = conversions[key];
    }
    result.set(name, value === null ? null : String(value));
  }
  return result;
}

export function planTransformations(s: Session, text: string) {
  const proposal = exchangeObject(
    readExchangeJSON(text, recordInputLimit, transformationError),
    transformationError,
    ["format", "version", "fields"],
  );
  if (proposal.format !== "veraflow-transformations" || proposal.version !== 1)
    throw Error(transformationError);
  const entries = Object.entries(
    exchangeObject(proposal.fields, transformationError),
  );
  if (!entries.length || entries.length > 1000)
    throw Error(transformationError);
  const current = recordValues(s);
  const kinds = new Map<string, string>();
  const values = new Map<string, string>();
  for (const [name, item] of entries) {
    const change = exchangeObject(item, transformationError, [
      "kind",
      "from",
      "to",
    ]);
    if (
      !fieldId(name) ||
      typeof change.kind !== "string" ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(change.kind) ||
      typeof change.from !== "string" ||
      typeof change.to !== "string" ||
      change.from.includes("\0") ||
      change.to.includes("\0") ||
      !change.to.trim()
    )
      throw Error(transformationError);
    if (!current.has(name) || current.get(name) !== change.from)
      throw Error("transformationStale");
    kinds.set(name, change.kind);
    values.set(name, change.to);
  }
  return planRecordValues(s, values).map((change) => ({
    ...change,
    kind: kinds.get(s.fields[change.index].name)!,
  }));
}

export function applyTransformations(
  s: Session,
  changes: ReturnType<typeof planTransformations>,
) {
  const previous = changes.map(({ index }) =>
    recordHistory(s.recordState, s.fields[index].name),
  );
  applyRecordChanges(s, changes, { source: "transformation" });
  changes.forEach(({ index, kind, previous: from, value: to }, i) => {
    const history = recordHistory(s.recordState, s.fields[index].name)!;
    if (previous[i]) history.origin = previous[i]!.origin;
    // Keep the original and the latest accepted transitions if the limit is reached.
    const earlier = previous[i]?.transformations ?? [];
    history.transformations = [
      ...earlier.slice(0, 1),
      ...earlier.slice(Math.max(1, earlier.length - 6)),
      { kind, from: from!, to: to! },
    ];
  });
}

export async function validatedRecord(
  s: Session,
  scope: CollectionScope = currentRecordScope(s),
  withHistory = false,
) {
  const gaps = recordGaps(s, scope);
  if (!gaps.ready) throw Error("recordNotReady");
  const source = parseSource(s.template.content);
  const ids =
    "outputId" in scope
      ? [scope.outputId]
      : scope.step === null
        ? source.outputs.map(({ id }) => id)
        : source.steps![scope.step].outputs;
  // Use normal output validation as well as gap analysis. This checks missing
  // runtime variables and verification even if the record itself looks complete.
  const snapshot = structuredClone(s);
  for (const id of ids) {
    const output = source.outputs.find((part) => part.id === id)!;
    if (source.steps)
      activateFormStep(
        snapshot,
        source.steps.findIndex((step) => step.outputs.includes(id)),
        id,
      );
    else snapshot.outputId = id;
    if (output.row) spreadsheetRow(snapshot);
    if (output.sections.length) prepareSections(snapshot);
  }
  const all = recordValues(s);
  const known = new Set(gaps.known);
  const fields = Object.fromEntries(
    [...all]
      .filter(([id]) => known.has(id))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const verified = Object.keys(fields).filter(
    (id) => s.fields.find((field) => field.name === id)?.status === "verified",
  );
  const revision = await recordRevision(s);
  const history = withHistory
    ? fieldsHistory(s, Object.keys(fields))
    : undefined;
  const fingerprint = await recordFingerprint({
    revision,
    scope,
    fields,
    verified,
    history,
  });
  return {
    format: "veraflow-reviewed-record" as const,
    version: 1 as const,
    revision,
    scope,
    validation: "complete" as const,
    verification: "requirements-met" as const,
    fingerprint,
    fields,
    verified,
    ...(withHistory ? { history } : {}),
  };
}

export function fieldsHistory(s: Session, names: string[]) {
  const fields = new Map(s.fields.map((field) => [field.name, field]));
  return Object.fromEntries(
    names.flatMap((name) => {
      const entry = recordHistory(s.recordState, name);
      if (entry) return [[name, entry] as const];
      const field = fields.get(name);
      return field &&
        !field.recordInput &&
        field.value !== null &&
        field.value === s.controls?.get(name)?.defaultValue
        ? [[name, { origin: { source: "default" as const } }] as const]
        : [];
    }),
  );
}

// Sorting object members makes the digest independent of key order or pretty printing.
function canonicalJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJSON);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, canonicalJSON(item)]),
  );
}

function recordFingerprint(payload: {
  revision: unknown;
  scope: CollectionScope;
  fields: Record<string, unknown>;
  verified: string[];
  history?: unknown;
}) {
  return sha256(JSON.stringify(canonicalJSON(payload)));
}

export async function readReviewedRecord(text: string) {
  const root = exchangeObject(
    readExchangeJSON(text, recordInputLimit * 4, reviewedError),
    reviewedError,
    [
      "format",
      "version",
      "revision",
      "scope",
      "validation",
      "verification",
      "fields",
      "verified",
      "history",
      "fingerprint",
      "approval",
    ],
  );
  const fields = exchangeObject(root.fields, reviewedError);
  const entries = Object.entries(fields);
  if (
    root.format !== "veraflow-reviewed-record" ||
    root.version !== 1 ||
    typeof root.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(root.revision) ||
    root.validation !== "complete" ||
    root.verification !== "requirements-met" ||
    entries.length > 1000 ||
    entries.some(
      ([key, value]) =>
        !fieldId(key) || typeof value !== "string" || value.includes("\0"),
    ) ||
    !Array.isArray(root.verified) ||
    !root.verified.every(
      (key) =>
        fieldId(key) &&
        Object.hasOwn(fields, key) &&
        String(fields[key]).trim(),
    ) ||
    new Set(root.verified).size !== root.verified.length
  )
    throw Error(reviewedError);
  const scope = readScope(root.scope);
  const history =
    root.history === undefined
      ? undefined
      : readRecordState({ version: 1, history: root.history }).history;
  if (
    history &&
    Object.keys(history).some((key) => !Object.hasOwn(fields, key))
  )
    throw Error(reviewedError);
  if (
    (await recordFingerprint({
      revision: root.revision,
      scope,
      fields,
      verified: root.verified,
      history,
    })) !== root.fingerprint
  )
    throw Error(reviewedError);
  if (root.approval !== undefined) {
    const approval = exchangeObject(root.approval, reviewedError, [
      "at",
      "fingerprint",
    ]);
    if (
      approval.fingerprint !== root.fingerprint ||
      typeof approval.at !== "string" ||
      !Number.isFinite(Date.parse(approval.at)) ||
      new Date(approval.at).toISOString() !== approval.at
    )
      throw Error(reviewedError);
  }
  return root;
}
