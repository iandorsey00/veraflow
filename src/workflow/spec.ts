import { evaluate, parse, type ValueNode } from "@humanwhocodes/momoa";
import { exchangeObject, readExchangeJSON } from "../core/exchange-json";
import { mapSourceRecord, planTransformations } from "../core/interoperability";
import { recordGaps } from "../core/gaps";
import { defaultComparison, defaultPreferences } from "../core/model";
import { fieldId, readScope, type CollectionScope } from "../core/record-state";
import { prepareWorkflow, startSession } from "../core/session";
import { parseSource } from "../core/source";
import { recordInputLimit } from "../core/source-record";

export const invalidWorkflow = "invalidWorkflow";
const key = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
const label = (value: unknown): value is string =>
  typeof value === "string" &&
  !!value.trim() &&
  value.length <= 250 &&
  !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value);
const object = (value: unknown, keys?: string[]) =>
  exchangeObject(value, invalidWorkflow, keys);

export type Workflow = {
  format: "veraflow-workflow";
  version: 1;
  id: string;
  revision: string;
  title: string;
  scope: CollectionScope;
  collection: { provider: string };
  sourceMapping?: Record<string, unknown>;
  transformations?: Record<string, { kind: string; from: string; to: string }>;
  destination: {
    adapter: string;
    id: string;
    fields: Record<string, string>;
    pages: string[];
  };
  policy: {
    autofill: "automatic" | "manual";
    defaults: "confirm" | "allow-assumed";
    maxAttempts: number;
    completion: "human-review";
  };
};

export function readWorkflow(text: string, authoring = false): Workflow {
  if (new TextEncoder().encode(text).length > recordInputLimit)
    throw Error(invalidWorkflow);
  function decode(node: ValueNode, depth: number): unknown {
    if (depth > 12) throw Error(invalidWorkflow);
    if (node.type === "Array")
      return node.elements.map(({ value }) => decode(value, depth + 1));
    if (node.type !== "Object") {
      const value = evaluate(node);
      if (typeof value === "number" && !Number.isFinite(value))
        throw Error(invalidWorkflow);
      return value;
    }
    const entries = new Map<string, unknown>();
    for (const { name, value } of node.members) {
      const id = name.type === "String" ? name.value : name.name;
      if (entries.has(id)) throw Error(invalidWorkflow);
      entries.set(id, decode(value, depth + 1));
    }
    return Object.fromEntries(entries);
  }
  let data: unknown;
  try {
    data = authoring
      ? decode(parse(text.replace(/^\uFEFF/, ""), { mode: "json5" }).body, 1)
      : readExchangeJSON(text, recordInputLimit, invalidWorkflow);
  } catch {
    throw Error(invalidWorkflow);
  }
  const root = object(data, [
    "format",
    "version",
    "id",
    "revision",
    "title",
    "scope",
    "collection",
    "sourceMapping",
    "transformations",
    "destination",
    "policy",
  ]);
  const provider = object(root.collection, ["provider"]);
  const destination = object(root.destination, [
    "adapter",
    "id",
    "fields",
    "pages",
  ]);
  const policy = object(root.policy, [
    "autofill",
    "defaults",
    "maxAttempts",
    "completion",
  ]);
  const fields = Object.entries(object(destination.fields));
  if (
    root.format !== "veraflow-workflow" ||
    root.version !== 1 ||
    !key(root.id) ||
    !key(root.revision) ||
    !label(root.title) ||
    !key(provider.provider) ||
    !key(destination.adapter) ||
    !key(destination.id) ||
    !fields.length ||
    fields.length > 1000 ||
    fields.some(([target, source]) => !key(target) || !fieldId(source)) ||
    !Array.isArray(destination.pages) ||
    !destination.pages.length ||
    destination.pages.length > 32 ||
    !destination.pages.every(key) ||
    new Set(destination.pages).size !== destination.pages.length ||
    (policy.autofill !== "automatic" && policy.autofill !== "manual") ||
    (policy.defaults !== "confirm" && policy.defaults !== "allow-assumed") ||
    !Number.isInteger(policy.maxAttempts) ||
    Number(policy.maxAttempts) < 1 ||
    Number(policy.maxAttempts) > 5 ||
    policy.completion !== "human-review"
  )
    throw Error(invalidWorkflow);
  let scope: CollectionScope;
  try {
    scope = readScope(root.scope);
  } catch {
    throw Error(invalidWorkflow);
  }
  if (root.sourceMapping !== undefined) {
    const mapping = object(root.sourceMapping, ["format", "version", "fields"]);
    // Validate every native mapping rule without requiring any private source values.
    const rules = Object.entries(object(mapping.fields)).map(([id, rule]) => [
      id,
      { ...object(rule), required: false },
    ]);
    for (const [, rule] of Object.entries(object(mapping.fields))) {
      const { required } = object(rule);
      if (required !== undefined && typeof required !== "boolean")
        throw Error(invalidWorkflow);
    }
    mapSourceRecord(
      "{}",
      JSON.stringify({ ...mapping, fields: Object.fromEntries(rules) }),
    );
  }
  if (root.transformations !== undefined) {
    for (const [id, raw] of Object.entries(object(root.transformations))) {
      const change = object(raw, ["kind", "from", "to"]);
      if (
        !fieldId(id) ||
        typeof change.kind !== "string" ||
        !/^[a-z][a-z0-9_-]{0,63}$/.test(change.kind) ||
        typeof change.from !== "string" ||
        typeof change.to !== "string" ||
        change.from.includes("\0") ||
        change.to.includes("\0") ||
        !change.to.trim() ||
        change.from === change.to
      )
        throw Error(invalidWorkflow);
    }
  }
  return { ...root, scope } as Workflow;
}

export function workflowSession(
  workflow: Workflow,
  content: string,
  created?: string,
) {
  const source = parseSource(content);
  if (
    source.snippets ||
    source.workflow === "csv" ||
    source.workflow === "append"
  )
    throw Error("workflowNeedsForm");
  const session = startSession({
    id: workflow.id,
    name: source.title ?? workflow.title,
    folder: "",
    fieldOrder: [],
    placeholderStyle: "source",
    content,
    comparison: defaultComparison,
    verificationEnabled: defaultPreferences.verificationDefault,
  });
  session.unifiedForm = true;
  if (created && session.sourceContext)
    session.sourceContext.timestamp = new Date(created);
  prepareWorkflow(session, true);
  return session;
}

export function validateWorkflowForm(workflow: Workflow, content: string) {
  if (new TextEncoder().encode(content).length > 4 * recordInputLimit)
    throw Error("workflowInputTooLarge");
  const source = parseSource(content);
  if (source.responses.size || source.verification.size || source.recordState)
    throw Error("workflowNeedsBlankForm");
  const session = workflowSession(workflow, content);
  recordGaps(session, workflow.scope);
  const ownerFields = [
    ...Object.values(workflow.destination.fields),
    ...Object.keys(workflow.transformations ?? {}),
    ...Object.keys((workflow.sourceMapping?.fields ?? {}) as object),
  ];
  if (ownerFields.some((name) => !source.fields.includes(name)))
    throw Error("workflowUnknownField");
  // Validate replacement values through the same rules used by interactive forms.
  for (const [name, rule] of Object.entries(workflow.transformations ?? {})) {
    const example = structuredClone(session);
    example.fields.find((field) => field.name === name)!.value = rule.from;
    planTransformations(
      example,
      JSON.stringify({
        format: "veraflow-transformations",
        version: 1,
        fields: { [name]: rule },
      }),
    );
  }
}
