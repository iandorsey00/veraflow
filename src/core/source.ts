import { filenamePatternError } from "./filenames";
import { validControlValue, type Control } from "./form";

type Condition = {
  name: string;
  test: "boolean" | "notBoolean" | "blank" | "notBlank" | "equals";
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
type Delivery = {
  mode: DeliveryMode;
  after: Map<string, SectionKey[]>;
  separator: string;
};
const defaultDelivery: Delivery = {
  mode: "step",
  after: new Map(),
  separator: "\n",
};
function deliverySettings(raw: unknown): Delivery {
  if (raw === undefined) return defaultDelivery;
  const settings = object(raw);
  const extra = Object.keys(settings).find(
    (key) => !["mode", "after", "separator"].includes(key),
  );
  if (extra)
    fail(
      `Unknown delivery property "${extra}". Use "mode", "after", or "separator".`,
    );
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
  const separator =
    settings.separator === undefined
      ? defaultDelivery.separator
      : string(settings.separator, "delivery.separator");
  if (separator.length > 1024)
    fail("delivery.separator must be at most 1,024 characters.");
  return { mode, after, separator };
}
type Source = {
  title?: string;
  workflow?: SourceWorkflow;
  responses: ReadonlyMap<string, string | null>;
  delivery: Delivery;
  outputs: SourceOutput[];
  recordOnlyFields: string[];
  filename?: string;
  controls: Map<string, Control>;
  fields: string[];
  conditionDrivers: string[];
};
type SourceOutput = {
  id: string;
  label: string;
  sections: Section[];
  delivery: Delivery;
};
const id = /^[A-Za-z0-9_-]+$/;
const doubleQuoted = String.raw`"(?:[^"\\\r\n]|\\[^\r\n])*"`;
const singleQuoted = String.raw`'(?:[^'\\\r\n]|\\[^\r\n])*'`;
const quoted = `(?:${doubleQuoted}|${singleQuoted})`;
const conditionText = String.raw`[^:{}]+?`;
const clause = String.raw`(?:${conditionText}):\s*${quoted}`;
const inlinePattern = String.raw`when\s+(${clause}(?:\s+else\s+if\s+${clause})*(?:\s+else\s*:\s*${quoted})?)`;
const inlineClause = new RegExp(
  String.raw`\s*(?:else\s+if\s+)?(${conditionText}):\s*(${quoted})`,
  "uy",
);
const inlineElse = new RegExp(String.raw`\s+else\s*:\s*(${quoted})`, "uy");
type Block = { id: string; label: string; text: string; line: number };
function namedBlocks(
  text: string,
  kind: "output" | "section",
  startLine: number,
): Block[] | undefined {
  const opening = new RegExp(
    String.raw`^\{\{#${kind} ([A-Za-z0-9_-]+) (${quoted})\}\}$`,
    "u",
  );
  const marker = new RegExp(String.raw`^\s*\{\{#${kind}\b`, "m");
  if (!marker.test(text)) return;
  const result: Block[] = [];
  const ids = new Set<string>();
  let current:
    { id: string; label: string; lines: string[]; line: number } | undefined;
  let number = startLine - 1;
  for (const line of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    number++;
    const tag = line.trim();
    if (!current) {
      if (!tag) continue;
      const match = opening.exec(tag);
      if (!match)
        fail(`Expected {{#${kind} id "Title"}} on its own line.`, number);
      if (ids.has(match[1]))
        fail(`Duplicate ${kind} ID "${match[1]}".`, number);
      ids.add(match[1]);
      current = {
        id: match[1],
        label: quotedText(match[2], `${kind} title`, number),
        lines: [],
        line: number,
      };
    } else if (tag === `{{/${kind}}}`) {
      result.push({
        id: current.id,
        label: current.label,
        text: current.lines.join("").replace(/(?:\r\n|\r|\n)$/, ""),
        line: current.line + 1,
      });
      current = undefined;
    } else {
      if (tag.startsWith(`{{#${kind}`))
        fail(
          `Close "${current.id}" with {{/${kind}}} before opening another ${kind}.`,
          number,
        );
      current.lines.push(line);
    }
  }
  if (current) fail(`Missing {{/${kind}}} for "${current.id}".`, current.line);
  return result;
}
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
        "outputs",
        "filename",
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
    outputSettings:
      header.outputs === undefined ? {} : object(header.outputs, '"outputs"'),
    filename:
      header.filename === undefined
        ? undefined
        : string(header.filename, '"filename"'),
  } satisfies Pick<
    Source,
    "controls" | "title" | "workflow" | "responses" | "delivery" | "filename"
  > & { syntax?: "plain"; outputSettings: Record<string, unknown> };
}
function condition(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
  line: number,
): Condition {
  const match =
    /^(?:(not)\s+)?([A-Za-z0-9_-]+)(?:\s*=\s*([A-Za-z0-9_-]+)| is (blank|not blank))?$/.exec(
      text.trim(),
    );
  if (!match)
    fail(
      'Use a Boolean field, field=option_id, "is blank", or "is not blank" in this condition.',
      line,
    );
  const [, negated, name, value, blank] = match;
  if (negated && (value !== undefined || blank))
    fail('Use "not" with a Boolean field by itself.', line);
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
  return { name, test: negated ? "notBoolean" : "boolean" };
}
function quotedText(source: string, label: string, line: number) {
  // JSON escape rules also apply in single quotes, with an extra escape for apostrophes.
  const json = source.startsWith("'")
    ? '"' +
      source
        .slice(1, -1)
        .replace(/\\.|"/g, (c) => (c === "\\'" ? "'" : c === '"' ? '\\"' : c)) +
      '"'
    : source;
  return string(parseJSON(json, label, line));
}

function textNodes(
  text: string,
  advanced: boolean,
  controls: Map<string, Control>,
  fields: Set<string>,
  line = 1,
): Node[] {
  const nodes: Node[] = [];
  const fieldPattern = String.raw`\{\{([^<>{}\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+)\}\}`;
  const escaped = String.raw`\\(?:\\|\{\{)`;
  const pattern = new RegExp(
    advanced
      ? String.raw`${escaped}|\{\{\s*(?:${inlinePattern})\s*\}\}|${fieldPattern}`
      : `${escaped}|${fieldPattern}`,
    "gu",
  );
  const addLiteral = (value: string) => {
    const at = value.indexOf("{{");
    if (advanced && at >= 0)
      fail(
        'Close the placeholder with }}. Inline conditions use {{when condition: "text" else: "other text"}}.',
        line + lineBreaks(value.slice(0, at)),
      );
    nodes.push(value);
    line += lineBreaks(value);
  };
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index!;
    if (at > end) addLiteral(text.slice(end, at));
    end = at + match[0].length;
    if (advanced && match[1] !== undefined) {
      // Parse placeholders in the branch. Values inserted later are never parsed again.
      const branch = (raw: string) =>
        textNodes(
          quotedText(raw, "Conditional output", line),
          false,
          controls,
          fields,
          line,
        );
      const clauses = match[1];
      let offset = 0;
      let destination = nodes;
      let entry: RegExpExecArray | null;
      let count = 0;
      inlineClause.lastIndex = 0;
      while ((entry = inlineClause.exec(clauses))) {
        if (++count > 16) fail("Use up to 16 branches in a condition.", line);
        const node = {
          condition: condition(entry[1], controls, fields, line),
          yes: branch(entry[2]),
          no: [] as Node[],
        };
        destination.push(node);
        destination = node.no;
        offset = inlineClause.lastIndex;
        if (offset === clauses.length) break;
        inlineElse.lastIndex = offset;
        const otherwise = inlineElse.exec(clauses);
        if (otherwise) {
          destination.push(...branch(otherwise[1]));
          break;
        }
      }
    } else {
      const raw = match[advanced ? 2 : 1];
      const name = raw?.trim();
      if (name === undefined) nodes.push(match[0].slice(1));
      else if (advanced && /^when(?:\s|$)/u.test(name))
        fail(
          'Use {{when condition: "text" else: "other text"}} for inline output.',
          line,
        );
      else if (advanced && /^(?:[#/]|else(?:\s|$))/.test(name))
        fail(
          `Unexpected {{${name}}}. Put block tags on their own lines and check their opening and closing tags.`,
          line,
        );
      else if (name) {
        fields.add(name);
        nodes.push({ field: name });
      } else nodes.push(match[0]);
    }
    line += lineBreaks(match[0]);
  }
  if (end < text.length) addLiteral(text.slice(end));
  return nodes;
}
function lineBreaks(text: string) {
  return text.match(/\r\n|\r|\n/g)?.length ?? 0;
}
// Block tags consume their entire line. Ordinary text keeps its original line ending.
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
    clauses: number;
    line: number;
  }[] = [];
  let nodes = root;
  let number = startLine - 1;
  // Buffer ordinary lines so an inline when can span lines without emitting them.
  let pending: string[] = [];
  const flush = () => {
    const firstLine = number - pending.length;
    for (const node of textNodes(
      pending.join(""),
      true,
      controls,
      fields,
      firstLine,
    ))
      nodes.push(node);
    pending = [];
  };
  for (const line of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    number++;
    const tag = line.trim();
    const open = /^\{\{#when (.+)\}\}$/.exec(tag);
    if (open) {
      flush();
      if (stack.length >= 16)
        fail("Conditions can be nested up to 16 levels.", number);
      const branch = {
        condition: condition(open[1], controls, fields, number),
        yes: [],
        no: [],
      };
      nodes.push(branch);
      stack.push({
        branch,
        parent: nodes,
        hasElse: false,
        clauses: 1,
        line: number,
      });
      nodes = branch.yes;
    } else if (/^\{\{else if .+\}\}$/.test(tag)) {
      flush();
      const top = stack.at(-1);
      if (!top || top.hasElse)
        fail("{{else if …}} needs an open condition before {{else}}.", number);
      if (++top.clauses > 16)
        fail("Use up to 16 branches in a condition.", number);
      const branch = {
        condition: condition(tag.slice(10, -2), controls, fields, number),
        yes: [],
        no: [],
      };
      top.branch.no.push(branch);
      top.branch = branch;
      nodes = branch.yes;
    } else if (tag === "{{else}}") {
      flush();
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
      flush();
      const top = stack.pop();
      if (!top) fail("{{/when}} needs a matching {{#when …}}.", number);
      nodes = top.parent;
    } else pending.push(line);
  }
  number++;
  flush();
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

// Preview and validation repeatedly parse the same open template. Cache only the last source.
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
  const {
    controls,
    title,
    workflow,
    syntax,
    responses,
    delivery,
    outputSettings,
    filename,
  } = header
    ? metadata(header[1])
    : {
        controls: new Map<string, Control>(),
        title: undefined,
        workflow: undefined,
        syntax: undefined,
        delivery: defaultDelivery,
        outputSettings: {},
        filename: undefined,
        responses: new Map<string, string | null>(),
      };
  // Prefilled plain files have a metadata header but still use the plain grammar.
  const advanced = !!header && syntax !== "plain";
  const referenced = new Set<string>();
  const body = header ? source.slice(header[0].length) : source;
  const bodyLine = 1 + lineBreaks(header?.[0] ?? "");
  const named = advanced ? namedBlocks(body, "output", bodyLine) : undefined;
  const definitions = named ?? [
    { id: "main", label: title ?? "Output", text: body, line: bodyLine },
  ];
  const outputs = definitions.map((definition) => {
    const entries = (advanced
      ? namedBlocks(definition.text, "section", definition.line)
      : undefined) ?? [
      {
        id: "body",
        label: "Body",
        text: definition.text,
        line: definition.line,
      },
    ];
    const sections = entries.map(({ id, label, text, line }) => ({
      id,
      label,
      nodes: advanced
        ? blocks(text, controls, referenced, line)
        : textNodes(text, false, controls, referenced, line),
    }));
    const hasSettings = Object.hasOwn(outputSettings, definition.id);
    const outputDelivery = hasSettings
      ? deliverySettings(outputSettings[definition.id])
      : delivery;
    for (const [sectionId, keys] of outputDelivery.after) {
      const index = sections.findIndex((section) => section.id === sectionId);
      if (index < 0)
        fail(
          `delivery.after refers to unknown section "${sectionId}" in output "${definition.id}".`,
        );
      if (index === sections.length - 1 && keys.length)
        fail(`The last section "${sectionId}" cannot have navigation keys.`);
    }
    return {
      id: definition.id,
      label: definition.label,
      sections,
      delivery: outputDelivery,
    };
  });
  for (const name of Object.keys(outputSettings))
    if (!outputs.some((output) => output.id === name))
      fail(`Settings refer to unknown output "${name}".`);
  const fields = new Set([...controls.keys(), ...referenced]);
  if (
    outputs.reduce((count, output) => count + output.sections.length, 0) >
      100 ||
    fields.size > 1000
  )
    fail("A source file supports up to 100 sections and 1,000 fields.");
  const filenameError =
    filename === undefined ? undefined : filenamePatternError(filename, fields);
  if (filenameError) fail(filenameError);
  const recordOnlyFields = [...controls.keys()].filter(
    (name) => !referenced.has(name),
  );
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
    outputs,
    recordOnlyFields,
    filename,
    controls,
    fields: [...fields],
    conditionDrivers: conditionFields(
      outputs.flatMap((output) => output.sections),
    ),
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
  // Exports of reusable definitions must leave out responses from the current case.
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
  // A saved null suppresses the field default. Missing keys still inherit defaults.
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
  outputId?: string,
) {
  let length = 0;
  const part = (text: string, missing = false) => {
    length += text.length;
    if (!used && length > 16 * 1024 * 1024) throw Error("invalidText");
    return { text, missing };
  };
  // The same traversal drives field visibility and output so both select the same branches.
  const parts = (nodes: Node[]): { text: string; missing: boolean }[] =>
    nodes.flatMap((node) => {
      if (typeof node === "string") return used ? [] : [part(node)];
      if ("field" in node) {
        if (used) {
          used.add(node.field);
          return [];
        }
        // Emit the value or choice text directly. Template markers in a value remain literal.
        const value = values.get(node.field);
        const options = source.controls.get(node.field)?.options;
        return value === undefined
          ? [part(`{{${node.field}}}`, true)]
          : [part(options?.get(value) ?? value)];
      }
      const { name, test, value } = node.condition;
      used?.add(name);
      const actual = values.get(name);
      if (
        (actual === undefined || actual === "") &&
        (test === "boolean" || test === "notBoolean" || test === "equals")
      )
        return used ? [] : [part(`{{${name}}}`, true)];
      const match =
        test === "boolean" || test === "notBoolean"
          ? actual === (test === "boolean" ? "true" : "false")
          : test === "equals"
            ? actual === value
            : test === "blank"
              ? !actual?.trim()
              : !!actual?.trim();
      return parts(match ? node.yes : node.no);
    });
  const sections =
    outputId === undefined && used
      ? source.outputs.flatMap((output) => output.sections)
      : sourceOutput(source, outputId).sections;
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    parts: parts(section.nodes),
  }));
}

export function sourceOutput(source: Source, id?: string) {
  const output =
    id === undefined
      ? source.outputs[0]
      : source.outputs.find((output) => output.id === id);
  if (!output) throw Error("invalidSource");
  return output;
}
