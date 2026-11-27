import type { Session } from "./model";
import type { CollectionScope } from "./record-state";
import { fieldRequiresVerification, currentFormStep } from "./session";
import { parseSource, sourceOutput, sourceParts } from "./source";
import { normalizeRecordValue } from "./source-record";

export function currentRecordScope(s: Session): CollectionScope {
  if (s.outputId) return { outputId: s.outputId };
  if (currentFormStep(s)) return { step: s.stepIndex ?? 0 };
  return { outputId: sourceOutput(parseSource(s.template.content)).id };
}

export function recordGaps(
  s: Session,
  scope = currentRecordScope(s),
  incoming: ReadonlyMap<string, string | null> = new Map(),
) {
  if (s.template.placeholderStyle !== "source") throw Error("recordNeedsForm");
  const source = parseSource(s.template.content);
  if (source.snippets) throw Error("recordNeedsForm");
  const outputId = "outputId" in scope ? scope.outputId : undefined;
  const stepIndex = "step" in scope ? scope.step : null;
  const step = outputId
    ? source.steps?.find((step) => step.outputs.includes(outputId))
    : stepIndex === null
      ? undefined
      : source.steps?.[stepIndex];
  const outputs = outputId
    ? [outputId]
    : (step?.outputs ?? source.outputs.map(({ id }) => id));
  if (
    (stepIndex !== null && !step) ||
    outputs.some((id) => !source.outputs.some((output) => output.id === id))
  )
    throw Error("collectionStale");
  const states = new Map<
    string,
    {
      presence: "omitted" | "null" | "empty" | "default" | "value";
      invalid: boolean;
    }
  >();
  const values = new Map<string, string>();
  const unknown: string[] = [];
  for (const name of incoming.keys())
    if (!source.fields.includes(name)) unknown.push(name);
  for (const field of s.fields) {
    const { name } = field;
    const supplied = incoming.has(name);
    const explicit =
      supplied || field.recordInput || source.responses.has(name);
    const value = supplied
      ? incoming.get(name)!
      : field.status === "skipped"
        ? ""
        : field.value;
    const defaultValue = source.controls.get(name)?.defaultValue;
    let normalized = value;
    let invalid = false;
    try {
      normalized = normalizeRecordValue(s, name, value);
    } catch {
      invalid = true;
    }
    const fromDefault = !explicit && value !== null && value === defaultValue;
    states.set(name, {
      presence: fromDefault
        ? "default"
        : value === null
          ? explicit
            ? "null"
            : "omitted"
          : normalized === ""
            ? "empty"
            : "value",
      invalid,
    });
    if (normalized !== null && !invalid) values.set(name, normalized);
  }
  const used = new Set(step ? step.alwaysVisible : source.recordOnlyFields);
  const unresolved = new Set<string>();
  const deferred = new Set<string>();
  for (const id of outputs) {
    const output = source.outputs.find((part) => part.id === id)!;
    sourceParts(source, values, used, id, s.sourceContext, false, undefined, {
      unresolved,
      deferred,
    });
    if (output.row)
      sourceParts(source, values, used, id, s.sourceContext, true, undefined, {
        unresolved,
        deferred,
      });
  }
  const fields = source.fields.map((id) => {
    const field = s.fields.find((field) => field.name === id)!;
    const state = states.get(id)!;
    const optional =
      source.controls.get(id)?.optional === true && !unresolved.has(id);
    const applicable = used.has(id);
    const status = !applicable
      ? deferred.has(id)
        ? "deferred"
        : "inapplicable"
      : state.invalid
        ? "invalid"
        : !values.has(id) || unresolved.has(id)
          ? optional
            ? "missingOptional"
            : "missingRequired"
          : "known";
    const pendingVerification =
      status === "known" &&
      !!values.get(id)?.trim() &&
      fieldRequiresVerification(s, field) &&
      (field.status !== "verified" || field.value !== values.get(id));
    return { id, presence: state.presence, status, pendingVerification };
  });
  const list = (status: string) =>
    fields.filter((field) => field.status === status).map(({ id }) => id);
  const missingRequired = list("missingRequired");
  const invalid = [...list("invalid"), ...unknown];
  const pendingVerification = fields
    .filter((field) => field.pendingVerification)
    .map(({ id }) => id);
  return {
    format: "veraflow-gaps" as const,
    version: 1 as const,
    scope,
    ...(outputId === undefined ? {} : { outputId }),
    ready:
      !missingRequired.length &&
      !invalid.length &&
      !pendingVerification.length &&
      !unresolved.size,
    known: list("known"),
    missingRequired,
    missingOptional: list("missingOptional"),
    inapplicable: list("inapplicable"),
    invalid,
    pendingVerification,
    unresolvedConditions: [...unresolved],
    deferred: list("deferred"),
    fields,
  };
}
