import { parseSourceMetadata, sourceHeader } from "./source-header";
import { filenamePatternError } from "./filenames";
import { normalizeText, validControlValue, type Control } from "./form";
import {
  templateVariable,
  variableValue,
  type TemplateContext,
} from "./variables";

type Condition = {
  name: string;
  test:
    | "boolean"
    | "notBoolean"
    | "blank"
    | "notBlank"
    | "option"
    | "equals"
    | "contains";
  value?: string;
};
type Node =
  | string
  | { field: string }
  | { variable: NonNullable<ReturnType<typeof templateVariable>> }
  | { loop: string; values: string[]; body: Node[] }
  | { condition: Condition; yes: Node[]; no: Node[] };
type Section = { id: string; label: string; nodes: Node[] };
export type VerificationWorkflow = "form" | "scanner";
export type SourceWorkflow = "form" | "scanner" | "csv" | "append";
type AppendSource = {
  file?: string;
  duplicateKey?: string;
  carryForward: string[];
};
type CSVSource = {
  file: string;
  rowLabel?: string;
};

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
  instructions?: string;
  verifyByDefault?: boolean;
  workflow?: SourceWorkflow;
  responses: ReadonlyMap<string, string | null>;
  verification: ReadonlyMap<string, VerificationWorkflow>;
  delivery: Delivery;
  outputs: SourceOutput[];
  steps?: FormStep[];
  snippets: boolean;
  recordOnlyFields: string[];
  filename?: string;
  csv?: CSVSource;
  append?: AppendSource;
  csvLabel?: (
    values: ReadonlyMap<string, string>,
    context?: TemplateContext,
  ) => string;
  controls: Map<string, Control>;
  fields: string[];
  conditionDrivers: string[];
};
export type FormStep = {
  title: string;
  fields: string[];
  outputs: string[];
  references: Set<string>;
  alwaysVisible: string[];
};
type SourceOutput = {
  id: string;
  label: string;
  sections: Section[];
  references: Set<string>;
  row?: Section[];
  instructions?: string;
  delivery: Delivery;
};
const id = /^[A-Za-z0-9_-]+$/;
const doubleQuoted = String.raw`"(?:[^"\\\r\n]|\\[^\r\n])*"`;
const singleQuoted = String.raw`'(?:[^'\\\r\n]|\\[^\r\n])*'`;
const comment = String.raw`\{\{![^\r\n]*?\}\}`;
const fullLineComment = /^\{\{!(?:(?!\}\})[^\r\n])*\}\}$/u;
const quoted = `(?:${doubleQuoted}|${singleQuoted})`;
const conditionText = String.raw`(?:${quoted}|[^"':{}])+?`;
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
  kind: "output" | "section" | "action",
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
      if (!tag || fullLineComment.test(tag)) continue;
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
function relativeCSV(value: unknown, label: string) {
  const file = string(value, label);
  if (
    file.length > 1024 ||
    !/\.csv$/i.test(file) ||
    /[:\\\p{Cc}]/u.test(file) ||
    file.split("/").some((part) => !part || part === "." || part === "..")
  )
    fail(
      label + " must point to a CSV next to the template or in a subfolder.",
    );
  return file;
}
function csvMetadata(raw: unknown): CSVSource {
  const value = object(raw, '"csv"');
  if (Object.keys(value).some((key) => key !== "file" && key !== "rowLabel"))
    fail('Use only "file" and "rowLabel" in "csv".');
  const file = relativeCSV(value.file, "csv.file");
  const rowLabel =
    value.rowLabel === undefined
      ? undefined
      : string(value.rowLabel, '"csv.rowLabel"');
  if (rowLabel !== undefined && rowLabel.length > 1024)
    fail('"csv.rowLabel" must be at most 1,024 characters.');
  return { file, rowLabel };
}
function appendMetadata(raw: unknown): AppendSource {
  const config = object(raw, '"append"');
  if (
    Object.keys(config).some(
      (key) => !["file", "duplicateKey", "carryForward"].includes(key),
    )
  )
    fail('"append" supports "file", "duplicateKey", and "carryForward".');
  const file =
    config.file === undefined
      ? undefined
      : relativeCSV(config.file, "append.file");
  const duplicateKey =
    config.duplicateKey === undefined
      ? undefined
      : string(config.duplicateKey, "append.duplicateKey");
  if (duplicateKey !== undefined && !duplicateKey.trim())
    fail('"append.duplicateKey" must be a column name.');
  const carryForward = config.carryForward ?? [];
  if (
    !Array.isArray(carryForward) ||
    !carryForward.every((name) => typeof name === "string") ||
    new Set(carryForward).size !== carryForward.length
  )
    fail('"append.carryForward" must contain unique field names.');
  return { file, duplicateKey, carryForward };
}
function metadata(text: string) {
  const header = object(parseSourceMetadata(text, fail));
  const unknown = Object.keys(header).find(
    (key) =>
      ![
        "title",
        "instructions",
        "verify-by-default",
        "fields",
        "workflow",
        "responses",
        "verification",
        "syntax",
        "delivery",
        "outputs",
        "steps",
        "filename",
        "csv",
        "append",
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
  const instructions =
    header.instructions === undefined
      ? undefined
      : string(header.instructions, '"instructions"').trim() || undefined;
  const verifyByDefault = header["verify-by-default"];
  if (verifyByDefault !== undefined && typeof verifyByDefault !== "boolean")
    fail('"verify-by-default" must be true or false.');
  const syntax = header.syntax;
  if (syntax !== undefined && syntax !== "plain")
    fail('"syntax" must be "plain" when present.');
  const workflow = header.workflow;
  if (
    workflow !== undefined &&
    workflow !== "form" &&
    workflow !== "scanner" &&
    workflow !== "csv" &&
    workflow !== "append"
  )
    fail('"workflow" must be "form", "scanner", "csv", or "append".');
  const csv = header.csv === undefined ? undefined : csvMetadata(header.csv);
  if (workflow === "csv" && csv === undefined)
    fail('"workflow": "csv" requires a "csv" object.');
  const append =
    header.append === undefined ? undefined : appendMetadata(header.append);
  const controls = new Map<string, Control>();
  for (const [name, raw] of Object.entries(
    header.fields === undefined ? {} : object(header.fields, '"fields"'),
  )) {
    if (!name.trim() || name.includes("\0"))
      fail(`Field names must be nonblank and cannot contain a null character.`);
    const field = object(raw, `Field "${name}"`);
    const extra = Object.keys(field).find(
      (key) =>
        ![
          "type",
          "label",
          "instructions",
          "aliases",
          "default",
          "optional",
          "options",
          "multiline",
          "allowBlankLines",
          "verify",
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
    if (field.verify !== undefined && typeof field.verify !== "boolean")
      fail(`"${name}.verify" must be true or false.`);
    const control: Control = {
      kind,
      optional: field.optional === true,
      verify: field.verify,
    };
    if (field.label !== undefined)
      control.label = string(field.label, `"${name}.label"`);
    if (field.instructions !== undefined)
      control.instructions =
        string(field.instructions, `"${name}.instructions"`).trim() ||
        undefined;
    if (field.aliases !== undefined) {
      if (!Array.isArray(field.aliases) || field.aliases.length > 32)
        fail(`Field "${name}" supports up to 32 aliases.`);
      const aliases = field.aliases.map((alias) =>
        string(alias, `An alias for "${name}"`).trim(),
      );
      if (
        aliases.some(
          (alias) => !alias || alias.length > 250 || /[\r\n:：\t]/u.test(alias),
        ) ||
        new Set(aliases.map((alias) => alias.toLowerCase())).size !==
          aliases.length
      )
        fail(
          `Use unique, nonblank aliases without line breaks, colons, or tabs for "${name}".`,
        );
      control.aliases = aliases;
    }
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
    if (control.defaultValue !== undefined)
      control.defaultValue = normalizeText(control, control.defaultValue);
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
      responses.set(
        name,
        raw === null ? null : normalizeText(controls.get(name), string(raw)),
      );
    }
  }
  const verification = new Map<string, VerificationWorkflow>();
  for (const [name, scope] of Object.entries(
    header.verification === undefined
      ? {}
      : object(header.verification, '"verification"'),
  )) {
    if (scope !== "form" && scope !== "scanner")
      fail(`Verification for "${name}" must be "form" or "scanner".`);
    const value = responses.get(name);
    if (!value?.trim())
      fail(`Verification for "${name}" requires a saved response.`);
    verification.set(name, scope);
  }
  return {
    controls,
    title,
    instructions,
    verifyByDefault,
    workflow,
    syntax,
    responses,
    verification,
    delivery: deliverySettings(header.delivery),
    csv,
    append,
    rawSteps: header.steps,
    outputSettings:
      header.outputs === undefined ? {} : object(header.outputs, '"outputs"'),
    filename:
      header.filename === undefined
        ? undefined
        : string(header.filename, '"filename"'),
  } satisfies Pick<
    Source,
    | "controls"
    | "title"
    | "instructions"
    | "verifyByDefault"
    | "workflow"
    | "responses"
    | "verification"
    | "delivery"
    | "filename"
    | "csv"
    | "append"
  > & {
    syntax?: "plain";
    rawSteps: unknown;
    outputSettings: Record<string, unknown>;
  };
}
function formSteps(
  raw: unknown,
  fields: Set<string>,
  outputs: Map<string, Set<string>>,
): FormStep[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 100)
    fail('"steps" must contain 2–100 steps.');
  const assigned = new Set<string>();
  const usedOutputs = new Set<string>();
  const steps = raw.map<FormStep>((entry, index) => {
    const path = `Step ${index + 1}`;
    const step = object(entry, path);
    if (
      Object.keys(step).some(
        (key) => !["title", "fields", "output", "outputs"].includes(key),
      )
    )
      fail(
        `${path} supports "title", "fields", and "outputs" (or the legacy "output").`,
      );
    const title = string(step.title, `${path} title`).trim();
    if (!title || title.length > 250 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(title))
      fail(`${path} needs a single-line title of 1–250 characters.`);
    if (Object.hasOwn(step, "output") && Object.hasOwn(step, "outputs"))
      fail(`${path} cannot combine "output" and "outputs".`);
    const ids = Object.hasOwn(step, "output") ? [step.output] : step.outputs;
    if (!Array.isArray(ids)) fail(`${path} needs an "outputs" array.`);
    if (!Array.isArray(step.fields)) fail(`${path} needs a "fields" array.`);
    const names = step.fields.map((rawName) => {
      const name = string(rawName, `${path} field name`);
      if (!fields.has(name)) fail(`${path} refers to unknown field "${name}".`);
      if (assigned.has(name))
        fail(`Field "${name}" is assigned to more than one step.`);
      assigned.add(name);
      return name;
    });
    const references = new Set<string>();
    const assignedOutputs = ids.map((rawId) => {
      const output = string(rawId, `${path} output`);
      const dependencies = outputs.get(output);
      if (!dependencies) fail(`${path} refers to unknown output "${output}".`);
      if (usedOutputs.has(output))
        fail(`Output "${output}" is assigned to more than one step.`);
      usedOutputs.add(output);
      for (const name of dependencies) {
        if (!assigned.has(name))
          fail(`Output "${output}" uses "${name}" before its step.`);
        references.add(name);
      }
      return output;
    });
    return {
      title,
      fields: names,
      outputs: assignedOutputs,
      references,
      alwaysVisible: [],
    };
  });
  for (const name of fields)
    if (!assigned.has(name)) fail(`Field "${name}" is missing from "steps".`);
  for (const output of outputs.keys())
    if (!usedOutputs.has(output))
      fail(`Output "${output}" is missing from "steps".`);
  // A field entered for a later output must remain editable in its owning step.
  const later = new Set<string>();
  for (const step of [...steps].reverse()) {
    step.alwaysVisible = step.fields.filter(
      (name) => !step.references.has(name) || later.has(name),
    );
    for (const name of step.references) later.add(name);
  }
  return steps;
}

function condition(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
  line: number,
  locals: Set<string>,
): Condition {
  const match = new RegExp(
    String.raw`^(?:(not)\s+)?(${doubleQuoted}|[A-Za-z0-9_-]+)(?:\s*=\s*([A-Za-z0-9_-]+)|\s+is\s+(blank|not\s+blank)|\s+(equals|contains)\s+(${quoted}))?$`,
    "u",
  ).exec(text.trim());
  if (!match)
    fail(
      'Use a Boolean field, field=option_id, "is blank", "is not blank", or equals/contains followed by quoted text.',
      line,
    );
  const [, negated, reference, value, blank, operation, operand] = match;
  const name = reference.startsWith('"')
    ? quotedText(reference, "Field name", line)
    : reference;
  if (!name.trim()) fail("A field name must not be blank.", line);
  if (negated && (value !== undefined || blank || operation))
    fail('Use "not" with a Boolean field by itself.', line);
  if (!locals.has(name)) fields.add(name);
  if (blank) return { name, test: blank === "blank" ? "blank" : "notBlank" };
  if (operation)
    return {
      name,
      test: operation === "equals" ? "equals" : "contains",
      value: quotedText(operand, "Condition operand", line),
    };
  if (value !== undefined) {
    if (locals.has(name) || !controls.get(name)?.options?.has(value))
      fail(`"${value}" is not a defined option ID on "${name}".`, line);
    return { name, test: "option", value };
  }
  if (locals.has(name) || controls.get(name)?.kind !== "boolean")
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
  allowQuoted = advanced,
  locals = new Set<string>(),
): Node[] {
  const nodes: Node[] = [];
  const fieldPattern = String.raw`\{\{([^<>{}\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+)\}\}`;
  const quotedField = String.raw`\{\{[ \t]*(${doubleQuoted})[ \t]*\}\}`;
  const escaped = String.raw`\\(?:\\|\{\{)`;
  const pattern = new RegExp(
    advanced
      ? String.raw`${escaped}|${comment}|\{\{\s*(?:${inlinePattern})\s*\}\}|${quotedField}|${fieldPattern}`
      : `${escaped}|${allowQuoted ? comment + "|" + quotedField + "|" : ""}${fieldPattern}`,
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
    if (allowQuoted && match[0].startsWith("{{!")) continue;
    if (advanced && match[1] !== undefined) {
      // Parse placeholders in the branch. Values inserted later are never parsed again.
      const branch = (raw: string) =>
        textNodes(
          quotedText(raw, "Conditional output", line),
          false,
          controls,
          fields,
          line,
          true,
          locals,
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
          condition: condition(entry[1], controls, fields, line, locals),
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
    } else if (allowQuoted && match[advanced ? 2 : 1] !== undefined) {
      const field = quotedText(
        match[advanced ? 2 : 1],
        "Quoted field name",
        line,
      );
      if (!field.trim()) fail("A field name must not be blank.", line);
      if (!locals.has(field)) fields.add(field);
      nodes.push({ field });
    } else {
      const raw = match[advanced ? 3 : allowQuoted ? 2 : 1];
      const name = raw?.trim();
      if (name === undefined) nodes.push(match[0].slice(1));
      else if (allowQuoted && name.startsWith("@")) {
        const variable = templateVariable(name);
        if (!variable)
          fail(`Unknown or invalid template variable "${name}".`, line);
        nodes.push({ variable });
      } else if (advanced && /^when(?:\s|$)/u.test(name))
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
        if (!locals.has(name)) fields.add(name);
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

function loopValues(expression: string, line: number): string[] {
  const range = /^range\(\s*(-?\d+)\s*(?:,\s*(-?\d+)\s*)?\)$/.exec(expression);
  if (range) {
    const start = range[2] === undefined ? 0 : Number(range[1]);
    const end = Number(range[2] ?? range[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start ||
      end - start > 100
    )
      fail("Use an ascending range of up to 100 integers.", line);
    return Array.from({ length: end - start }, (_, index) =>
      String(start + index),
    );
  }
  if (!expression.startsWith("["))
    fail("Use a JSON list or range(start, end) in a loop.", line);
  const list = parseJSON(expression, "The loop list", line);
  if (!Array.isArray(list) || list.length > 100)
    fail("Use a JSON list with up to 100 entries.", line);
  return list.map((entry) => {
    if (
      (typeof entry === "number" && Number.isFinite(entry)) ||
      typeof entry === "boolean"
    )
      return String(entry);
    if (typeof entry !== "string" || entry.includes("\0"))
      fail("Loop lists accept strings, numbers, and Booleans.", line);
    return entry;
  });
}

// Block tags consume their entire line. Ordinary text keeps its original line ending.
function blocks(
  text: string,
  controls: Map<string, Control>,
  fields: Set<string>,
  startLine: number,
): Node[] {
  const root: Node[] = [];
  type Branch = {
    branch: Extract<Node, { condition: Condition }>;
    parent: Node[];
    hasElse: boolean;
    clauses: number;
    line: number;
  };
  type Loop = { loop: string; parent: Node[]; line: number };
  const stack: (Branch | Loop)[] = [];
  const locals = new Set<string>();
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
      true,
      locals,
    ))
      nodes.push(node);
    pending = [];
  };
  for (const line of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    number++;
    const tag = line.trim();
    const open = /^\{\{#when (.+)\}\}$/.exec(tag);
    const loop =
      /^\{\{#for ([A-Za-z_][A-Za-z0-9_-]*)\s+in\s+(.+?)\s*\}\}$/.exec(tag);
    if (fullLineComment.test(tag)) {
      flush();
    } else if (open || loop) {
      flush();
      if (stack.length >= 16)
        fail("Template blocks can be nested up to 16 levels.", number);
      if (loop) {
        const [, name, expression] = loop;
        if (locals.has(name))
          fail(`A loop already uses "${name}" in this scope.`, number);
        const block = {
          loop: name,
          values: loopValues(expression, number),
          body: [] as Node[],
        };
        nodes.push(block);
        stack.push({ loop: name, parent: nodes, line: number });
        locals.add(name);
        nodes = block.body;
        continue;
      }
      const branch = {
        condition: condition(open![1], controls, fields, number, locals),
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
      if (!top || "loop" in top || top.hasElse)
        fail("{{else if …}} needs an open condition before {{else}}.", number);
      if (++top.clauses > 16)
        fail("Use up to 16 branches in a condition.", number);
      const branch = {
        condition: condition(
          tag.slice(10, -2),
          controls,
          fields,
          number,
          locals,
        ),
        yes: [],
        no: [],
      };
      top.branch.no.push(branch);
      top.branch = branch;
      nodes = branch.yes;
    } else if (tag === "{{else}}") {
      flush();
      const top = stack.at(-1);
      if (!top || "loop" in top || top.hasElse)
        fail(
          top && !("loop" in top)
            ? "This condition already has an {{else}}."
            : "{{else}} needs an opening {{#when …}}.",
          number,
        );
      top.hasElse = true;
      nodes = top.branch.no;
    } else if (tag === "{{/when}}" || tag === "{{/for}}") {
      flush();
      const top = stack.pop();
      if (!top || "loop" in top !== (tag === "{{/for}}"))
        fail(`${tag} needs a matching opening tag.`, number);
      if ("loop" in top) locals.delete(top.loop);
      nodes = top.parent;
    } else pending.push(line);
  }
  number++;
  flush();
  const unclosed = stack.at(-1);
  if (unclosed)
    fail(
      "loop" in unclosed
        ? "This {{#for …}} is missing its closing {{/for}}."
        : "This {{#when …}} is missing its closing {{/when}}.",
      unclosed.line,
    );
  return root;
}

function conditionFields(sections: Section[]) {
  const drivers = new Set<string>();
  const visit = (nodes: Node[], locals = new Set<string>()) => {
    for (const node of nodes) {
      if (typeof node === "string") continue;
      if ("loop" in node) visit(node.body, new Set([...locals, node.loop]));
      else if ("condition" in node) {
        const branches = [...node.yes, ...node.no];
        if (
          !locals.has(node.condition.name) &&
          branches.some((part) => typeof part !== "string")
        )
          drivers.add(node.condition.name);
        visit(branches, locals);
      }
    }
  };
  for (const section of sections) visit(section.nodes);
  return [...drivers];
}

function expandedSize(nodes: Node[]): number {
  let size = 0;
  for (const node of nodes) {
    size++;
    if (typeof node === "string") continue;
    if ("condition" in node)
      size += Math.max(expandedSize(node.yes), expandedSize(node.no));
    if ("loop" in node)
      size += node.values.length * (1 + expandedSize(node.body));
  }
  return size;
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
  const header = sourceHeader(source);
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
    instructions,
    verifyByDefault,
    workflow,
    syntax,
    responses,
    verification,
    delivery,
    outputSettings,
    rawSteps,
    filename,
    csv,
    append,
  } = header
    ? metadata(header.metadata)
    : {
        controls: new Map<string, Control>(),
        title: undefined,
        instructions: undefined,
        verifyByDefault: undefined,
        workflow: undefined,
        syntax: undefined,
        delivery: defaultDelivery,
        outputSettings: {},
        rawSteps: undefined,
        filename: undefined,
        csv: undefined,
        append: undefined,
        responses: new Map<string, string | null>(),
        verification: new Map<string, VerificationWorkflow>(),
      };
  // Prefilled plain files have a metadata header but still use the plain grammar.
  const advanced = !!header && syntax !== "plain";
  const referenced = new Set<string>();
  const body = header?.body ?? source;
  const bodyLine = 1 + lineBreaks(header?.prefix ?? "");
  const actions = advanced ? namedBlocks(body, "action", bodyLine) : undefined;
  if (
    actions?.some(
      ({ label }) => !label.trim() || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(label),
    )
  )
    fail("Use a nonblank, single-line button label for each action.");
  if (
    actions &&
    (workflow ||
      controls.size ||
      csv ||
      append ||
      responses.size ||
      verification.size ||
      rawSteps !== undefined ||
      Object.keys(outputSettings).length)
  )
    fail(
      "Snippet collections use action blocks and built-in variables. Remove fields, workflows, and output settings.",
    );
  const named =
    actions ?? (advanced ? namedBlocks(body, "output", bodyLine) : undefined);
  const definitions = named ?? [
    { id: "main", label: title ?? "Output", text: body, line: bodyLine },
  ];
  const outputReferences = new Map<string, Set<string>>();
  const outputs = definitions.map((definition) => {
    const references = new Set<string>();
    const entries = (advanced && !actions
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
        ? blocks(text, controls, references, line)
        : textNodes(text, false, controls, references, line),
    }));
    for (const name of references) referenced.add(name);
    const hasSettings = Object.hasOwn(outputSettings, definition.id);
    const configured = hasSettings
      ? object(
          outputSettings[definition.id],
          `Settings for output "${definition.id}"`,
        )
      : undefined;
    let outputDelivery = delivery;
    let row: Section[] | undefined;
    let instructions: string | undefined;
    if (configured) {
      const { instructions: guidance, ...settings } = configured;
      if (guidance !== undefined)
        instructions =
          string(
            guidance,
            `Instructions for output "${definition.id}"`,
          ).trim() || undefined;
      if (
        Object.hasOwn(settings, "delivery") ||
        Object.hasOwn(settings, "row")
      ) {
        if (
          Object.keys(settings).some(
            (name) => name !== "delivery" && name !== "row",
          )
        )
          fail(
            `Output "${definition.id}" supports "instructions", "delivery", and "row".`,
          );
        const overrides = object(
          settings.delivery ?? {},
          `Delivery for "${definition.id}"`,
        );
        outputDelivery = deliverySettings({
          mode: delivery.mode,
          separator: delivery.separator,
          after: Object.fromEntries(delivery.after),
          ...overrides,
        });
        if (settings.row !== undefined) {
          const cells = Object.entries(object(settings.row, "row"));
          if (
            !cells.length ||
            cells.length > 1000 ||
            cells.some(([name]) => !name.trim() || name.includes("\0"))
          )
            fail('A "row" needs 1–1,000 named columns.');
          row = cells.map(([name, expression]) => ({
            id: name,
            label: name,
            nodes: blocks(
              string(expression, `Cell "${name}"`),
              controls,
              referenced,
              1,
            ),
          }));
        }
      } else if (Object.keys(settings).length || guidance === undefined) {
        // Existing source files used the delivery keys directly under the output ID.
        outputDelivery = deliverySettings(settings);
      }
    }
    for (const [sectionId, keys] of outputDelivery.after) {
      const index = sections.findIndex((section) => section.id === sectionId);
      if (index < 0)
        fail(
          `delivery.after refers to unknown section "${sectionId}" in output "${definition.id}".`,
        );
      if (index === sections.length - 1 && keys.length)
        fail(`The last section "${sectionId}" cannot have navigation keys.`);
    }
    outputReferences.set(definition.id, references);
    return {
      id: definition.id,
      label: definition.label,
      sections,
      references,
      row,
      instructions,
      delivery: outputDelivery,
    };
  });
  for (const name of Object.keys(outputSettings))
    if (!outputs.some((output) => output.id === name))
      fail(`Settings refer to unknown output "${name}".`);
  if (
    advanced &&
    outputs
      .flatMap((output) => [...output.sections, ...(output.row ?? [])])
      .reduce((total, section) => total + expandedSize(section.nodes), 0) >
      250_000
  )
    fail(
      "This template expands to too many operations. Use shorter or fewer nested loops.",
    );
  const fields = new Set([...controls.keys(), ...referenced]);
  if (
    rawSteps !== undefined &&
    ((workflow && workflow !== "form") ||
      csv ||
      append ||
      outputs.some((output) => output.row))
  )
    fail('"steps" is available for forms with text outputs.');
  const steps =
    rawSteps === undefined
      ? undefined
      : formSteps(rawSteps, fields, outputReferences);
  if (actions && fields.size)
    fail(
      `Snippet actions cannot reference form fields: ${[...fields].join(", ")}.`,
    );
  if (
    outputs.reduce((count, output) => count + output.sections.length, 0) >
      100 ||
    fields.size > 1000
  )
    fail("A source file supports up to 100 sections and 1,000 fields.");
  for (const name of append?.carryForward ?? [])
    if (!fields.has(name)) fail(`Unknown carry-forward field "${name}".`);
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
  const label =
    csv?.rowLabel === undefined
      ? undefined
      : textNodes(csv.rowLabel, true, controls, new Set());
  if (
    label?.some(
      (node) =>
        typeof node !== "string" && ("condition" in node || "loop" in node),
    )
  )
    fail('"csv.rowLabel" accepts text, variables, and placeholders.');
  const csvLabel = label
    ? (values: ReadonlyMap<string, string>, context?: TemplateContext) =>
        label
          .map((node) =>
            typeof node === "string"
              ? node
              : "field" in node
                ? (values.get(node.field)?.slice(0, 160) ?? "")
                : "variable" in node
                  ? (variableValue(node.variable, context) ?? "")
                  : "",
          )
          .join("")
    : undefined;
  const parsed = {
    outputs,
    steps,
    snippets: !!actions,
    csv,
    append,
    csvLabel,
    recordOnlyFields,
    filename,
    controls,
    fields: [...fields],
    conditionDrivers: conditionFields(
      outputs.flatMap((output) => [...output.sections, ...(output.row ?? [])]),
    ),
    title,
    instructions,
    verifyByDefault,
    workflow,
    responses,
    verification,
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
  const header = sourceHeader(source);
  if (!header && !title) return text;
  const metadata = header
    ? object(parseSourceMetadata(header.metadata, fail))
    : { syntax: "plain" };
  if (
    !Object.hasOwn(metadata, "responses") &&
    !Object.hasOwn(metadata, "verification") &&
    (!title || title === metadata.title)
  )
    return text;
  // Exports of reusable definitions must leave out responses from the current case.
  delete metadata.responses;
  delete metadata.verification;
  if (title) metadata.title = title;
  const definition = sourceWithHeader(metadata, header?.body ?? source);
  parseSource(definition);
  return definition;
}
export function prefillSource(
  text: string,
  responses: ReadonlyMap<string, string | null>,
  workflow: SourceWorkflow,
  title?: string,
  verification: ReadonlyMap<string, VerificationWorkflow> = new Map(),
  legacyVerifyDefault?: boolean,
) {
  const source = text.replace(/^\uFEFF/, "");
  const header = sourceHeader(source);
  const original = header
    ? object(parseSourceMetadata(header.metadata, fail))
    : { syntax: "plain" };
  delete original.verification;
  // A saved null suppresses the field default. Missing keys still inherit defaults.
  const saved = sourceWithHeader(
    {
      ...original,
      ...(title ? { title } : {}),
      workflow,
      ...(legacyVerifyDefault !== undefined &&
      original["verify-by-default"] === undefined
        ? { "verify-by-default": legacyVerifyDefault }
        : {}),
      responses: Object.fromEntries(responses),
      ...(verification.size
        ? { verification: Object.fromEntries(verification) }
        : {}),
    },
    header?.body ?? source,
  );
  parseSource(saved);
  forgetSource();
  return saved;
}

function conditionMatches(test: Condition, actual: string | undefined) {
  switch (test.test) {
    case "boolean":
      return actual === "true";
    case "notBoolean":
      return actual === "false";
    case "blank":
      return !actual?.trim();
    case "notBlank":
      return !!actual?.trim();
    case "option":
    case "equals":
      return actual === test.value;
    case "contains":
      return actual?.includes(test.value!) === true;
  }
}

export function sourceParts(
  source: Source,
  values: ReadonlyMap<string, string>,
  used?: Set<string>,
  outputId?: string,
  context?: TemplateContext,
  row = false,
  missingFields?: Set<string>,
) {
  let length = 0;
  const local = new Map<string, string>();
  const valueOf = (name: string) => local.get(name) ?? values.get(name);
  const sections =
    outputId === undefined && used
      ? source.outputs.flatMap((output) => [
          ...output.sections,
          ...(output.row ?? []),
        ])
      : row
        ? (sourceOutput(source, outputId).row ?? [])
        : sourceOutput(source, outputId).sections;
  const outputName =
    outputId === undefined && used
      ? undefined
      : sourceOutput(source, outputId).label;
  const variables = { templateName: source.title, ...context, outputName };
  return sections.map((section) => {
    const parts: { text: string; missing: boolean }[] = [];
    const emit = (text: string, missing = false) => {
      length += text.length;
      if (length > 16 * 1024 * 1024) throw Error("invalidText");
      if (text || missing) parts.push({ text, missing });
    };
    // Field discovery and rendering walk the same branches. Inserted values stay literal.
    const visit = (nodes: Node[]) => {
      for (const node of nodes) {
        if (typeof node === "string") {
          if (!used) emit(node);
        } else if ("field" in node) {
          if (used) {
            if (!local.has(node.field)) {
              used.add(node.field);
              if (valueOf(node.field) === undefined)
                missingFields?.add(node.field);
            }
            continue;
          }
          const value = valueOf(node.field);
          const options = local.has(node.field)
            ? undefined
            : source.controls.get(node.field)?.options;
          if (value === undefined) emit(`{{${node.field}}}`, true);
          else emit(options?.get(value) ?? value);
        } else if ("variable" in node) {
          if (used) continue;
          const value = variableValue(node.variable, variables);
          if (
            value === undefined &&
            (node.variable.name === "date" ||
              node.variable.name === "timestamp" ||
              node.variable.name === "selection" ||
              node.variable.name === "selection-or-clipboard" ||
              node.variable.name === "clipboard")
          )
            emit(`{{@${node.variable.name}}}`, true);
          else emit(value ?? "");
        } else if ("loop" in node) {
          for (const value of node.values) {
            local.set(node.loop, value);
            visit(node.body);
          }
          local.delete(node.loop);
        } else {
          const condition = node.condition;
          if (!local.has(condition.name)) used?.add(condition.name);
          const actual = valueOf(condition.name);
          if (
            !actual &&
            ["boolean", "notBoolean", "option"].includes(condition.test)
          ) {
            missingFields?.add(condition.name);
            if (!used) emit(`{{${condition.name}}}`, true);
          } else {
            visit(conditionMatches(condition, actual) ? node.yes : node.no);
          }
        }
      }
    };
    visit(section.nodes);
    return { id: section.id, label: section.label, parts };
  });
}

export function sourceOutput(source: Source, id?: string) {
  const output =
    id === undefined
      ? source.outputs[0]
      : source.outputs.find((output) => output.id === id);
  if (!output) throw Error("invalidSource");
  return output;
}
