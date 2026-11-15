import { validControlValue, type Control } from "./form";

type Condition = {
  name: string;
  test: "boolean" | "blank" | "notBlank" | "equals";
  value?: string;
};
type Node =
  | string
  | { field: string }
  | { condition: Condition; yes: Node[]; no: Node[] };
type Section = { id: string; label: string; nodes: Node[] };
export type SourceWorkflow = "form" | "scanner";
export type SectionKey = "Tab" | "Shift+Tab";
export type DeliveryMode = "step" | "sequence";
type Delivery = { mode: DeliveryMode; after: Map<string, SectionKey[]> };
const defaultDelivery: Delivery = { mode: "step", after: new Map() };
function deliverySettings(raw: unknown): Delivery {
  if (raw === undefined) return defaultDelivery;
  const settings = object(raw);
  if (Object.keys(settings).some((key) => key !== "mode" && key !== "after"))
    fail();
  const mode = settings.mode === undefined ? "step" : settings.mode;
  if (mode !== "step" && mode !== "sequence") fail();
  const after = new Map<string, SectionKey[]>();
  for (const [section, keys] of Object.entries(
    settings.after === undefined ? {} : object(settings.after),
  )) {
    if (
      !Array.isArray(keys) ||
      keys.length > 16 ||
      !keys.every((key) => key === "Tab" || key === "Shift+Tab")
    )
      fail();
    after.set(section, keys);
  }
  return { mode, after };
}
type Source = {
  workflow?: SourceWorkflow;
  responses: ReadonlyMap<string, string | null>;
  delivery: Delivery;
  sections: Section[];
  controls: Map<string, Control>;
  fields: string[];
};
const id = /^[A-Za-z0-9_-]+$/;
const quoted = '"(?:[^"\\\\]|\\\\.)*"';
const inline = new RegExp(
  `^when (.+?):\\s*(${quoted})(?:\\s+else:\\s*(${quoted}))?$`,
  "u",
);
const sectionTag = new RegExp(
  `^\\{\\{#section ([A-Za-z0-9_-]+) (${quoted})\\}\\}$`,
  "u",
);
const badName = /[<>{}\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
function fail(): never {
  throw Error("invalidSource");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || value.includes("\0")) fail();
  return value;
}
function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fail();
  }
}
const sourceHeader = /^--- veraflow 2\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
function metadata(text: string) {
  const header = object(parseJSON(text));
  if (
    Object.keys(header).some(
      (key) =>
        !["fields", "workflow", "responses", "syntax", "delivery"].includes(
          key,
        ),
    )
  )
    fail();
  const syntax = header.syntax;
  if (syntax !== undefined && syntax !== "plain") fail();
  const workflow = header.workflow;
  if (workflow !== undefined && workflow !== "form" && workflow !== "scanner")
    fail();
  const controls = new Map<string, Control>();
  for (const [name, raw] of Object.entries(object(header.fields ?? {}))) {
    if (!id.test(name)) fail();
    const field = object(raw);
    if (
      Object.keys(field).some(
        (key) =>
          ![
            "type",
            "label",
            "default",
            "optional",
            "options",
            "multiline",
            "allowBlankLines",
          ].includes(key),
      )
    )
      fail();
    const kind = field.type as Control["kind"];
    if (
      ![
        "boolean",
        "text",
        "textarea",
        "email",
        "date",
        "number",
        "radio",
        "dropdown",
      ].includes(kind)
    )
      fail();
    if (field.optional !== undefined && typeof field.optional !== "boolean")
      fail();
    const control: Control = { kind, optional: field.optional === true };
    if (field.label !== undefined) control.label = string(field.label);
    if (kind === "text" || kind === "textarea") {
      if (field.multiline !== undefined && typeof field.multiline !== "boolean")
        fail();
      if (
        field.allowBlankLines !== undefined &&
        typeof field.allowBlankLines !== "boolean"
      )
        fail();
      control.multiline = field.multiline ?? kind === "textarea";
      if (!control.multiline && field.allowBlankLines === true) fail();
      control.allowBlankLines =
        control.multiline && field.allowBlankLines !== false;
    } else if (
      field.multiline !== undefined ||
      field.allowBlankLines !== undefined
    )
      fail();
    if (kind === "boolean") {
      control.options = new Map([
        ["true", "true"],
        ["false", "false"],
      ]);
      if (field.default !== undefined) {
        if (typeof field.default !== "boolean") fail();
        control.defaultValue = String(field.default);
      }
    } else if (field.default !== undefined)
      control.defaultValue = string(field.default);
    if (kind === "radio" || kind === "dropdown") {
      if (
        !Array.isArray(field.options) ||
        !field.options.length ||
        field.options.length > 100
      )
        fail();
      control.options = new Map();
      control.optionLabels = new Map();
      for (const raw of field.options) {
        const option = object(raw);
        if (
          Object.keys(option).some(
            (key) => !["id", "label", "output"].includes(key),
          )
        )
          fail();
        const key = string(option.id),
          label = string(option.label);
        if (!id.test(key) || control.options.has(key)) fail();
        control.options.set(
          key,
          option.output === undefined ? label : string(option.output),
        );
        control.optionLabels.set(key, label);
      }
      control.defaultValue ??= control.options.keys().next().value;
    } else if (field.options !== undefined) fail();
    if (
      control.defaultValue !== undefined &&
      !(control.optional && control.defaultValue === "") &&
      !validControlValue(control, control.defaultValue)
    )
      fail();
    controls.set(name, control);
  }
  const responses = new Map<string, string | null>();
  if (header.responses !== undefined) {
    for (const [name, raw] of Object.entries(object(header.responses))) {
      responses.set(name, raw === null ? null : string(raw));
    }
  }
  return {
    controls,
    workflow,
    syntax,
    responses,
    delivery: deliverySettings(header.delivery),
  } satisfies Pick<
    Source,
    "controls" | "workflow" | "responses" | "delivery"
  > & { syntax?: "plain" };
}
function condition(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
): Condition {
  const match =
    /^([A-Za-z0-9_-]+)(?:\s*=\s*([A-Za-z0-9_-]+)| is (blank|not blank))?$/.exec(
      text.trim(),
    );
  if (!match) fail();
  const [, name, value, blank] = match;
  fields.add(name);
  if (blank) return { name, test: blank === "blank" ? "blank" : "notBlank" };
  if (value !== undefined) {
    if (!controls.get(name)?.options?.has(value)) fail();
    return { name, test: "equals", value };
  }
  if (controls.get(name)?.kind !== "boolean") fail();
  return { name, test: "boolean" };
}
function textNodes(
  text: string,
  advanced: boolean,
  controls: Map<string, Control>,
  fields: Set<string>,
): Node[] {
  const nodes: Node[] = [];
  const pattern = !advanced
    ? /\\(?:\\|\{\{)|\{\{([^<>{}\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+)\}\}/gu
    : /\\(?:\\|\{\{)|\{\{((?:[^"{}\r\n]|"(?:[^"\\\r\n]|\\[^\r\n])*")+)\}\}|\{\{([^{}\r\n]+)\}\}/gu;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index!;
    if (at > end) nodes.push(text.slice(end, at));
    end = at + match[0].length;
    const name = (match[1] ?? match[2])?.trim();
    if (name === undefined) nodes.push(match[0].slice(1));
    else if (advanced && name.startsWith("when ")) {
      const clause = inline.exec(name);
      if (!clause) fail();
      nodes.push({
        condition: condition(clause[1], controls, fields),
        yes: [string(parseJSON(clause[2]))],
        no: clause[3] ? [string(parseJSON(clause[3]))] : [],
      });
    } else if (advanced && /^(?:[#/]|else$)/.test(name)) fail();
    else if (name && !badName.test(match[1] ?? match[2])) {
      fields.add(name);
      nodes.push({ field: name });
    } else nodes.push(match[0]);
  }
  if (end < text.length) nodes.push(text.slice(end));
  return nodes;
}
function blocks(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
): Node[] {
  const root: Node[] = [];
  const stack: {
    branch: Extract<Node, { condition: Condition }>;
    parent: Node[];
    hasElse: boolean;
  }[] = [];
  let nodes = root;
  for (const line of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    const tag = line.trim();
    const open = /^\{\{#when (.+)\}\}$/.exec(tag);
    if (open) {
      if (stack.length >= 16) fail();
      const branch = {
        condition: condition(open[1], controls, fields),
        yes: [],
        no: [],
      };
      nodes.push(branch);
      stack.push({ branch, parent: nodes, hasElse: false });
      nodes = branch.yes;
    } else if (tag === "{{else}}") {
      const top = stack.at(-1);
      if (!top || top.hasElse) fail();
      top.hasElse = true;
      nodes = top.branch.no;
    } else if (tag === "{{/when}}") {
      const top = stack.pop();
      if (!top) fail();
      nodes = top.parent;
    } else
      for (const node of textNodes(line, true, controls, fields))
        nodes.push(node);
  }
  if (stack.length) fail();
  return root;
}

let cached: { text: string; parsed: Source } | undefined;
export function forgetSource() {
  cached = undefined;
}
export function parseSource(text: string): Source {
  if (cached?.text === text) return cached.parsed;
  if (text.length > 1024 * 1024 || text.includes("\0")) fail();
  const source = text.replace(/^\uFEFF/, "");
  const startsHeader = /^--- veraflow(?:\s|$)/.test(source);
  const header = sourceHeader.exec(source);
  if (startsHeader && !header) fail();
  const { controls, workflow, syntax, responses, delivery } = header
    ? metadata(header[1])
    : {
        controls: new Map<string, Control>(),
        workflow: undefined,
        syntax: undefined,
        delivery: defaultDelivery,
        responses: new Map<string, string | null>(),
      };
  const advanced = !!header && syntax !== "plain";
  const fields = new Set(controls.keys());
  const body = header ? source.slice(header[0].length) : source;
  const sections: Section[] = [];
  if (advanced && /^\s*\{\{#section\b/m.test(body)) {
    let open: { id: string; label: string; text: string[] } | undefined;
    for (const line of body.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
      const tag = line.trim();
      if (!open) {
        if (!tag) continue;
        const match = sectionTag.exec(tag);
        if (!match || sections.some((section) => section.id === match[1]))
          fail();
        open = { id: match[1], label: string(parseJSON(match[2])), text: [] };
      } else if (tag === "{{/section}}") {
        const content = open.text.join("").replace(/(?:\r\n|\r|\n)$/, "");
        sections.push({
          id: open.id,
          label: open.label,
          nodes: blocks(content, controls, fields),
        });
        open = undefined;
      } else open.text.push(line);
    }
    if (open) fail();
  } else
    sections.push({
      id: "body",
      label: "Body",
      nodes: advanced
        ? blocks(body, controls, fields)
        : textNodes(body, false, controls, fields),
    });
  if (!sections.length || sections.length > 100 || fields.size > 1000) fail();
  for (const [sectionId, keys] of delivery.after) {
    const index = sections.findIndex((section) => section.id === sectionId);
    if (index < 0 || (index === sections.length - 1 && keys.length)) fail();
  }
  for (const [name, value] of responses) {
    if (!fields.has(name)) fail();
    const control = controls.get(name);
    if (
      control &&
      value !== null &&
      !(control.optional && value === "") &&
      !validControlValue(control, value)
    )
      fail();
  }
  const parsed = {
    sections,
    controls,
    fields: [...fields],
    workflow,
    responses,
    delivery,
  };
  cached = { text, parsed };
  return parsed;
}

function sourceWithHeader(header: Record<string, unknown>, body: string) {
  return `--- veraflow 2\n${JSON.stringify(header, null, 2)}\n---\n${body}`;
}
export function sourceDefinitionText(text: string) {
  parseSource(text);
  const source = text.replace(/^\uFEFF/, "");
  const header = sourceHeader.exec(source);
  if (!header) return text;
  const metadata = object(parseJSON(header[1]));
  if (!Object.hasOwn(metadata, "responses")) return text;
  delete metadata.responses;
  forgetSource();
  return sourceWithHeader(metadata, source.slice(header[0].length));
}
export function prefillSource(
  text: string,
  responses: ReadonlyMap<string, string | null>,
  workflow: SourceWorkflow,
) {
  const source = text.replace(/^\uFEFF/, "");
  const header = sourceHeader.exec(source);
  const original = header ? object(parseJSON(header[1])) : { syntax: "plain" };
  const saved = sourceWithHeader(
    { ...original, workflow, responses: Object.fromEntries(responses) },
    header ? source.slice(header[0].length) : source,
  );
  parseSource(saved);
  forgetSource();
  return saved;
}

export function sourceParts(
  source: Source,
  values: ReadonlyMap<string, string>,
  used?: Set<string>,
) {
  let length = 0;
  const part = (text: string, missing = false) => {
    length += text.length;
    if (!used && length > 16 * 1024 * 1024) throw Error("invalidText");
    return { text, missing };
  };
  const parts = (nodes: Node[]): { text: string; missing: boolean }[] =>
    nodes.flatMap((node) => {
      if (typeof node === "string") return used ? [] : [part(node)];
      if ("field" in node) {
        if (used) {
          used.add(node.field);
          return [];
        }
        const value = values.get(node.field);
        const options = source.controls.get(node.field)?.options;
        return value === undefined
          ? [part(`{{${node.field}}}`, true)]
          : [part(options?.get(value) ?? value)];
      }
      const { name, test, value } = node.condition;
      used?.add(name);
      const actual = values.get(name);
      if (actual === undefined && (test === "boolean" || test === "equals"))
        return used ? [] : [part(`{{${name}}}`, true)];
      const match =
        test === "boolean"
          ? actual === "true"
          : test === "equals"
            ? actual === value
            : test === "blank"
              ? !actual?.trim()
              : !!actual?.trim();
      return parts(match ? node.yes : node.no);
    });
  return source.sections.map((section) => ({
    id: section.id,
    label: section.label,
    parts: parts(section.nodes),
  }));
}
