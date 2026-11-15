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
  const extra = Object.keys(settings).find(
    (key) => key !== "mode" && key !== "after",
  );
  if (extra)
    fail(`Unknown delivery property "${extra}". Use "mode" or "after".`);
  const mode = settings.mode === undefined ? "step" : settings.mode;
  if (mode !== "step" && mode !== "sequence")
    fail('delivery.mode must be "step" or "sequence".');
  const after = new Map<string, SectionKey[]>();
  for (const [section, keys] of Object.entries(
    settings.after === undefined ? {} : object(settings.after),
  )) {
    if (
      !Array.isArray(keys) ||
      keys.length > 16 ||
      !keys.every((key) => key === "Tab" || key === "Shift+Tab")
    )
      fail(
        `delivery.after.${section} must be a list of at most 16 "Tab" or "Shift+Tab" keys.`,
      );
    after.set(section, keys);
  }
  return { mode, after };
}
type Source = {
  title?: string;
  workflow?: SourceWorkflow;
  responses: ReadonlyMap<string, string | null>;
  delivery: Delivery;
  sections: Section[];
  controls: Map<string, Control>;
  fields: string[];
  conditionDrivers: string[];
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
export class SourceSyntaxError extends Error {
  constructor(
    public detail: string,
    public line?: number,
  ) {
    super("invalidSource");
  }
}
function fail(detail: string, line?: number): never {
  throw new SourceSyntaxError(detail, line);
}
function object(
  value: unknown,
  label = "The metadata",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label = "This value"): string {
  if (typeof value !== "string" || value.includes("\0"))
    fail(`${label} must be a string without null characters.`);
  return value;
}
function parseJSON(
  text: string,
  label = "The metadata header",
  line = 2,
): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const position = /position (\d+)/.exec(message)?.[1];
    const row = /line (\d+)/i.exec(message)?.[1];
    const offset = position
      ? text.slice(0, Number(position)).split("\n").length - 1
      : row
        ? Number(row) - 1
        : 0;
    return fail(
      `${label} contains invalid JSON. Check quotes, commas, and brackets.`,
      line + offset,
    );
  }
}
const sourceHeader = /^--- veraflow 2\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
function metadata(text: string) {
  const header = object(parseJSON(text));
  const unknown = Object.keys(header).find(
    (key) =>
      ![
        "title",
        "fields",
        "workflow",
        "responses",
        "syntax",
        "delivery",
      ].includes(key),
  );
  if (unknown) fail(`Unknown header property "${unknown}".`);
  const title =
    header.title === undefined
      ? undefined
      : string(header.title, '"title"').trim();
  if (
    title !== undefined &&
    (!title || title.length > 250 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(title))
  )
    fail('"title" must be a single line of 1–250 characters.');
  const syntax = header.syntax;
  if (syntax !== undefined && syntax !== "plain")
    fail('"syntax" must be "plain" when present.');
  const workflow = header.workflow;
  if (workflow !== undefined && workflow !== "form" && workflow !== "scanner")
    fail('"workflow" must be "form" or "scanner".');
  const controls = new Map<string, Control>();
  for (const [name, raw] of Object.entries(
    header.fields === undefined ? {} : object(header.fields, '"fields"'),
  )) {
    if (!id.test(name))
      fail(
        `Field ID "${name}" must use letters A–Z, digits, underscores, or hyphens.`,
      );
    const field = object(raw, `Field "${name}"`);
    const extra = Object.keys(field).find(
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
    );
    if (extra) fail(`Unknown property "${extra}" on field "${name}".`);
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
      fail(
        `Field "${name}" needs a supported type: text, textarea, email, date, number, boolean, radio, or dropdown.`,
      );
    if (field.optional !== undefined && typeof field.optional !== "boolean")
      fail(`"${name}.optional" must be true or false.`);
    const control: Control = { kind, optional: field.optional === true };
    if (field.label !== undefined)
      control.label = string(field.label, `"${name}.label"`);
    if (kind === "text" || kind === "textarea") {
      if (field.multiline !== undefined && typeof field.multiline !== "boolean")
        fail(`"${name}.multiline" must be true or false.`);
      if (
        field.allowBlankLines !== undefined &&
        typeof field.allowBlankLines !== "boolean"
      )
        fail(`"${name}.allowBlankLines" must be true or false.`);
      control.multiline = field.multiline ?? kind === "textarea";
      if (!control.multiline && field.allowBlankLines === true)
        fail(`Field "${name}" must be multiline to allow blank lines.`);
      control.allowBlankLines =
        control.multiline && field.allowBlankLines !== false;
    } else if (
      field.multiline !== undefined ||
      field.allowBlankLines !== undefined
    )
      fail(
        `Only text fields support multiline and allowBlankLines ("${name}").`,
      );
    if (kind === "boolean") {
      control.options = new Map([
        ["true", "true"],
        ["false", "false"],
      ]);
      if (field.default !== undefined) {
        if (typeof field.default !== "boolean")
          fail(
            `The default for Boolean field "${name}" must be true or false without quotes.`,
          );
        control.defaultValue = String(field.default);
      }
    } else if (field.default !== undefined)
      control.defaultValue = string(field.default, `The default for "${name}"`);
    if (kind === "radio" || kind === "dropdown") {
      if (
        !Array.isArray(field.options) ||
        !field.options.length ||
        field.options.length > 100
      )
        fail(`Field "${name}" needs between 1 and 100 options.`);
      control.options = new Map();
      control.optionLabels = new Map();
      for (const raw of field.options) {
        const option = object(raw, `An option for "${name}"`);
        if (
          Object.keys(option).some(
            (key) => !["id", "label", "output"].includes(key),
          )
        )
          fail(`Options for "${name}" only support id, label, and output.`);
        const key = string(option.id, `An option ID for "${name}"`),
          label = string(option.label, `An option label for "${name}"`);
        if (!id.test(key) || control.options.has(key))
          fail(`Option ID "${key}" on "${name}" is invalid or duplicated.`);
        control.options.set(
          key,
          option.output === undefined ? label : string(option.output),
        );
        control.optionLabels.set(key, label);
      }
      control.defaultValue ??= control.options.keys().next().value;
    } else if (field.options !== undefined)
      fail(`Only radio and dropdown fields support options ("${name}").`);
    if (
      control.defaultValue !== undefined &&
      !(control.optional && control.defaultValue === "") &&
      !validControlValue(control, control.defaultValue)
    )
      fail(
        `The default for "${name}" does not match its type, options, or text rules.`,
      );
    controls.set(name, control);
  }
  const responses = new Map<string, string | null>();
  if (header.responses !== undefined) {
    for (const [name, raw] of Object.entries(
      object(header.responses, '"responses"'),
    )) {
      responses.set(name, raw === null ? null : string(raw));
    }
  }
  return {
    controls,
    title,
    workflow,
    syntax,
    responses,
    delivery: deliverySettings(header.delivery),
  } satisfies Pick<
    Source,
    "controls" | "title" | "workflow" | "responses" | "delivery"
  > & { syntax?: "plain" };
}
function condition(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
  line: number,
): Condition {
  const match =
    /^([A-Za-z0-9_-]+)(?:\s*=\s*([A-Za-z0-9_-]+)| is (blank|not blank))?$/.exec(
      text.trim(),
    );
  if (!match)
    fail(
      'Use a Boolean field, field=option_id, "is blank", or "is not blank" in this condition.',
      line,
    );
  const [, name, value, blank] = match;
  fields.add(name);
  if (blank) return { name, test: blank === "blank" ? "blank" : "notBlank" };
  if (value !== undefined) {
    if (!controls.get(name)?.options?.has(value))
      fail(`"${value}" is not a defined option ID on "${name}".`, line);
    return { name, test: "equals", value };
  }
  if (controls.get(name)?.kind !== "boolean")
    fail(
      `Declare "${name}" as a Boolean field or add an explicit condition.`,
      line,
    );
  return { name, test: "boolean" };
}
function textNodes(
  text: string,
  advanced: boolean,
  controls: Map<string, Control>,
  fields: Set<string>,
  line = 1,
): Node[] {
  const nodes: Node[] = [];
  const pattern = !advanced
    ? /\\(?:\\|\{\{)|\{\{([^<>{}\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+)\}\}/gu
    : /\\(?:\\|\{\{)|\{\{((?:[^"{}\r\n]|"(?:[^"\\\r\n]|\\[^\r\n])*")+)\}\}|\{\{([^{}\r\n]+)\}\}/gu;
  const addLiteral = (value: string) => {
    if (advanced && value.includes("{{"))
      fail(
        "This placeholder or tag is incomplete. Close it with }} or escape the opening braces.",
        line,
      );
    nodes.push(value);
  };
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index!;
    if (at > end) addLiteral(text.slice(end, at));
    end = at + match[0].length;
    const name = (match[1] ?? match[2])?.trim();
    if (name === undefined) nodes.push(match[0].slice(1));
    else if (advanced && name.startsWith("when ")) {
      const clause = inline.exec(name);
      if (!clause)
        fail(
          'Use {{when condition: "text" else: "other text"}} for inline output.',
          line,
        );
      nodes.push({
        condition: condition(clause[1], controls, fields, line),
        yes: [string(parseJSON(clause[2], "Conditional output", line))],
        no: clause[3]
          ? [string(parseJSON(clause[3], "Conditional output", line))]
          : [],
      });
    } else if (advanced && /^(?:[#/]|else$)/.test(name))
      fail(
        `Unexpected {{${name}}}. Put block tags on their own lines and check their opening and closing tags.`,
        line,
      );
    else if (name && !badName.test(match[1] ?? match[2])) {
      fields.add(name);
      nodes.push({ field: name });
    } else nodes.push(match[0]);
  }
  if (end < text.length) addLiteral(text.slice(end));
  return nodes;
}
function blocks(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
  startLine: number,
): Node[] {
  const root: Node[] = [];
  const stack: {
    branch: Extract<Node, { condition: Condition }>;
    parent: Node[];
    hasElse: boolean;
    line: number;
  }[] = [];
  let nodes = root;
  let number = startLine - 1;
  for (const line of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    number++;
    const tag = line.trim();
    const open = /^\{\{#when (.+)\}\}$/.exec(tag);
    if (open) {
      if (stack.length >= 16)
        fail("Conditions can be nested up to 16 levels.", number);
      const branch = {
        condition: condition(open[1], controls, fields, number),
        yes: [],
        no: [],
      };
      nodes.push(branch);
      stack.push({ branch, parent: nodes, hasElse: false, line: number });
      nodes = branch.yes;
    } else if (tag === "{{else}}") {
      const top = stack.at(-1);
      if (!top || top.hasElse)
        fail(
          top
            ? "This condition already has an {{else}}."
            : "{{else}} needs an opening {{#when …}}.",
          number,
        );
      top.hasElse = true;
      nodes = top.branch.no;
    } else if (tag === "{{/when}}") {
      const top = stack.pop();
      if (!top) fail("{{/when}} needs a matching {{#when …}}.", number);
      nodes = top.parent;
    } else
      for (const node of textNodes(line, true, controls, fields, number))
        nodes.push(node);
  }
  if (stack.length)
    fail(
      "This {{#when …}} is missing its closing {{/when}}.",
      stack.at(-1)?.line,
    );
  return root;
}

function conditionFields(sections: Section[]) {
  const drivers = new Set<string>();
  const visit = (nodes: Node[]) => {
    for (const node of nodes) {
      if (typeof node === "string" || "field" in node) continue;
      const branches = [...node.yes, ...node.no];
      if (branches.some((part) => typeof part !== "string"))
        drivers.add(node.condition.name);
      visit(branches);
    }
  };
  for (const section of sections) visit(section.nodes);
  return [...drivers];
}

let cached: { text: string; parsed: Source } | undefined;
export function forgetSource() {
  cached = undefined;
}
export function parseSource(text: string): Source {
  if (cached?.text === text) return cached.parsed;
  if (text.length > 1024 * 1024 || text.includes("\0"))
    fail("Use a source file under 1 Mi characters without null characters.");
  const source = text.replace(/^\uFEFF/, "");
  if (/^\s*```[^\r\n]*\r?\n--- veraflow\b/.test(source))
    fail(
      "Remove the Markdown code fences around the template before saving the file.",
      1,
    );
  const startsHeader = /^--- veraflow(?:\s|$)/.test(source);
  const header = sourceHeader.exec(source);
  if (startsHeader && !header)
    fail(
      source.split(/\r?\n/, 1)[0] === "--- veraflow 2"
        ? 'End the JSON header with a line containing only "---".'
        : 'Use "--- veraflow 2" as the first line for a metadata header.',
      1,
    );
  const { controls, title, workflow, syntax, responses, delivery } = header
    ? metadata(header[1])
    : {
        controls: new Map<string, Control>(),
        title: undefined,
        workflow: undefined,
        syntax: undefined,
        delivery: defaultDelivery,
        responses: new Map<string, string | null>(),
      };
  const advanced = !!header && syntax !== "plain";
  const fields = new Set(controls.keys());
  const body = header ? source.slice(header[0].length) : source;
  const sections: Section[] = [];
  const bodyLine = 1 + (header?.[0].match(/\n/g)?.length ?? 0);
  if (advanced && /^\s*\{\{#section\b/m.test(body)) {
    let open:
      { id: string; label: string; text: string[]; line: number } | undefined;
    let number = bodyLine - 1;
    for (const line of body.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
      number++;
      const tag = line.trim();
      if (!open) {
        if (!tag) continue;
        const match = sectionTag.exec(tag);
        if (!match)
          fail('Expected {{#section id "Title"}} on its own line.', number);
        if (sections.some((section) => section.id === match[1]))
          fail(`Section ID "${match[1]}" is duplicated.`, number);
        open = {
          id: match[1],
          label: string(parseJSON(match[2], "Section title", number)),
          text: [],
          line: number,
        };
      } else if (tag === "{{/section}}") {
        const content = open.text.join("").replace(/(?:\r\n|\r|\n)$/, "");
        sections.push({
          id: open.id,
          label: open.label,
          nodes: blocks(content, controls, fields, open.line + 1),
        });
        open = undefined;
      } else {
        if (tag.startsWith("{{#section"))
          fail(
            `Section "${open.id}" is missing {{/section}} before this section.`,
            number,
          );
        open.text.push(line);
      }
    }
    if (open) fail(`Section "${open.id}" is missing {{/section}}.`, open.line);
  } else
    sections.push({
      id: "body",
      label: "Body",
      nodes: advanced
        ? blocks(body, controls, fields, bodyLine)
        : textNodes(body, false, controls, fields),
    });
  if (!sections.length || sections.length > 100 || fields.size > 1000)
    fail("A source file supports up to 100 sections and 1,000 fields.");
  for (const [sectionId, keys] of delivery.after) {
    const index = sections.findIndex((section) => section.id === sectionId);
    if (index < 0)
      fail(`delivery.after refers to unknown section "${sectionId}".`);
    if (index === sections.length - 1 && keys.length)
      fail(`The last section "${sectionId}" cannot have navigation keys.`);
  }
  for (const [name, value] of responses) {
    if (!fields.has(name))
      fail(`A saved response refers to unknown field "${name}".`);
    const control = controls.get(name);
    if (
      control &&
      value !== null &&
      !(control.optional && value === "") &&
      !validControlValue(control, value)
    )
      fail(`The saved response for "${name}" does not match its field rules.`);
  }
  const parsed = {
    sections,
    controls,
    fields: [...fields],
    conditionDrivers: conditionFields(sections),
    title,
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
export function sourceDefinitionText(text: string, title?: string) {
  parseSource(text);
  const source = text.replace(/^\uFEFF/, "");
  const header = sourceHeader.exec(source);
  if (!header && !title) return text;
  const metadata = header ? object(parseJSON(header[1])) : { syntax: "plain" };
  if (
    !Object.hasOwn(metadata, "responses") &&
    (!title || title === metadata.title)
  )
    return text;
  delete metadata.responses;
  if (title) metadata.title = title;
  const definition = sourceWithHeader(
    metadata,
    header ? source.slice(header[0].length) : source,
  );
  parseSource(definition);
  return definition;
}
export function prefillSource(
  text: string,
  responses: ReadonlyMap<string, string | null>,
  workflow: SourceWorkflow,
  title?: string,
) {
  const source = text.replace(/^\uFEFF/, "");
  const header = sourceHeader.exec(source);
  const original = header ? object(parseJSON(header[1])) : { syntax: "plain" };
  const saved = sourceWithHeader(
    {
      ...original,
      ...(title ? { title } : {}),
      workflow,
      responses: Object.fromEntries(responses),
    },
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
