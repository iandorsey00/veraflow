export type Control = {
  kind:
    | "boolean"
    | "text"
    | "textarea"
    | "email"
    | "date"
    | "number"
    | "radio"
    | "dropdown"
    | "checkbox"
    | "switch";
  options?: Map<string, string>;
  optionLabels?: Map<string, string>;
  label?: string;
  multiline?: boolean;
  allowBlankLines?: boolean;
  defaultValue?: string;
  when?: { name: string; value: string };
  optional?: boolean;
  verify?: boolean;
};
export type Directive = {
  name: string;
  control?: Control;
  choices?: ReadonlyMap<string, string>;
};

const quoted = '"(?:[^"\\\\]|\\\\.)*"';
const conditionalOutput = new RegExp(
  `^when ([\\w-]+)\\s*=\\s*([\\w-]+):\\s*(${quoted})$`,
  "u",
);
const inputDirective = new RegExp(
  `^(text|textarea|email|date|number) ([\\w-]+)(\\?)?:(?:\\s*(${quoted}))?(?:\\s*when ([\\w-]+)=([\\w-]+))?\\s*$`,
  "u",
);
const option = new RegExp(`^\\s*([\\w-]+)\\s*=\\s*(${quoted})\\s*`, "u");

function parseQuoted(value: string): string {
  try {
    const text: string = JSON.parse(value);
    if (text.includes("\0")) throw Error("invalidFormDirective");
    return text;
  } catch {
    throw Error("invalidFormDirective");
  }
}

function options(source: string) {
  const entries = new Map<string, string>();
  while (source) {
    const match = option.exec(source);
    if (!match || entries.has(match[1]) || entries.size >= 100)
      throw Error("invalidFormDirective");
    entries.set(match[1], parseQuoted(match[2]));
    source = source.slice(match[0].length);
    if (!source) break;
    if (!source.startsWith("|") || !source.slice(1).trim())
      throw Error("invalidFormDirective");
    source = source.slice(1);
  }
  if (!entries.size) throw Error("invalidFormDirective");
  return entries;
}

// Reserved brace syntax. Quoted values use JSON string escapes.
export function formDirective(name: string): Directive {
  const condition = conditionalOutput.exec(name);
  if (condition) {
    const [, field, value, output] = condition;
    return { name: field, choices: new Map([[value, parseQuoted(output)]]) };
  }
  if (/^when [\w-]+\s*=\s*[\w-]+:/u.test(name))
    throw Error("invalidFormDirective");
  const selection =
    /^(select|radio|dropdown|checkbox|switch|choice) ([\w-]+):\s*(.*)$/u.exec(
      name,
    );
  if (selection) {
    const [, type, id, source] = selection;
    const entries = options(source);
    if (type === "choice") return { name: id, choices: entries };
    const boolean = type === "checkbox" || type === "switch";
    if (
      boolean &&
      (entries.size !== 2 || !entries.has("yes") || !entries.has("no"))
    )
      throw Error("invalidFormDirective");
    return {
      name: id,
      control: {
        kind: type === "select" ? "radio" : (type as Control["kind"]),
        options: entries,
        defaultValue: boolean ? "no" : entries.keys().next().value,
      },
    };
  }
  const input = inputDirective.exec(name);
  if (input) {
    const [, kind, id, optional, defaultValue, dependency, value] = input;
    return {
      name: id,
      control: {
        kind: kind as Control["kind"],
        optional: !!optional,
        defaultValue:
          defaultValue === undefined ? undefined : parseQuoted(defaultValue),
        when: dependency ? { name: dependency, value } : undefined,
      },
    };
  }
  if (
    /^(select|radio|dropdown|checkbox|switch|choice|text|textarea|email|date|number) [\w-]+\??:/u.test(
      name,
    )
  )
    throw Error("invalidFormDirective");
  return { name };
}

const lineBreak = /\r\n|[\r\n\u0085\u2028\u2029]/u;
export function textLayoutError(control: Control | undefined, value: string) {
  if (control?.multiline === false && lineBreak.test(value))
    return "singleLineRequired";
}

export function stripBlankLines(value: string) {
  const lines = value.split(lineBreak);
  const nonblank = lines.filter((line) => line.trim().length > 0);
  return lines.length === nonblank.length ? value : nonblank.join("\n");
}

export function normalizeText(control: Control | undefined, value: string) {
  return control?.multiline && control.allowBlankLines === false
    ? stripBlankLines(value)
    : value;
}

export function validControlValue(control: Control, value: string) {
  if (textLayoutError(control, value)) return false;
  if (control.options) return control.options.has(value);
  if (control.kind === "number")
    return (
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
      Number.isFinite(Number(value))
    );
  if (control.kind === "email")
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value);
  if (control.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
      return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  }
  return !!value.trim();
}
