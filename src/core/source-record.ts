import { parse } from "@humanwhocodes/momoa";
import { normalizeText, validStoredValue } from "./form";
import type { Session } from "./model";
import { parseSource, sourceOutput, SourceSyntaxError } from "./source";
import { suggestedFilename } from "./filenames";

export function selectedSourceOutput(s: Session) {
  return sourceOutput(parseSource(s.template.content), s.outputId);
}
export function recordValues(s: Session) {
  return new Map(
    s.fields.map((field) => [
      field.name,
      field.status === "skipped" ? "" : field.value,
    ]),
  );
}

export function sourceFilename(
  s: Session,
  extension: "veraflow" | "json" | "txt" | "md" | "pdf",
) {
  const source = parseSource(s.template.content);
  const context = {
    templateName: s.template.name,
    ...s.sourceContext,
    timestamp: s.sourceContext?.timestamp ?? new Date(),
    outputName: selectedSourceOutput(s).label,
  };
  const timestamp =
    context.timestamp.toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
  const values = new Map<string, string>([
    ["timestamp", timestamp],
    ["template_name", s.template.name],
    ["workflow_name", s.template.name],
    ["output_name", selectedSourceOutput(s).label],
  ]);
  for (const [name, value] of recordValues(s))
    values.set(`field.${name}`, value ?? "");
  return suggestedFilename(
    source.filename ?? "{{template_name}}-{{timestamp}}",
    values,
    extension,
    context,
  );
}

export const recordInputLimit = 1024 * 1024;

export function readRecordInput(text: string) {
  if (new TextEncoder().encode(text).length > recordInputLimit)
    throw Error("recordInputLimit");
  const input = text.replace(/^\uFEFF/, "");
  let body: ReturnType<typeof parse>["body"];
  try {
    body = parse(input, { mode: "json5" }).body;
  } catch (error) {
    const line =
      error && typeof error === "object" && "line" in error ? error.line : 1;
    throw Error("recordInputSyntax:" + line);
  }
  if (body.type !== "Object" || !body.members.length)
    throw Error("recordInputObject");
  if (body.members.length > 1000) throw Error("recordInputLimit");
  const values = new Map<string, string | null>();
  for (const { name, value } of body.members) {
    const key = name.type === "String" ? name.value : name.name;
    if (!key.trim() || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(key))
      throw Error("recordInputName");
    if (values.has(key)) throw Error("recordInputDuplicate:" + key);
    switch (value.type) {
      case "Null":
        values.set(key, null);
        break;
      case "String":
        if (value.value.includes("\0"))
          throw Error("recordInvalidField:" + key);
        values.set(key, value.value);
        break;
      case "Boolean":
        values.set(key, String(value.value));
        break;
      case "Number": {
        if (!Number.isFinite(value.value))
          throw Error("recordInputNumber:" + key);
        // Read the original token so large identifiers and decimals don't round.
        const token = input.slice(value.loc.start.offset, value.loc.end.offset);
        const hex = /^([+-]?)(0x[\da-f]+)$/i.exec(token);
        values.set(
          key,
          hex ? String(BigInt(hex[2]) * (hex[1] === "-" ? -1n : 1n)) : token,
        );
        break;
      }
      case "Infinity":
      case "NaN":
        throw Error("recordInputNumber:" + key);
      default:
        throw Error("recordInputNested:" + key);
    }
  }
  return values;
}

export function recordFormSource(
  title: string,
  values: ReadonlyMap<string, string | null>,
  output: string,
) {
  const fields = Object.fromEntries(
    [...values].map(([name, value]) => [
      name,
      {
        type: /[\r\n\u0085\u2028\u2029]/u.test(value ?? "")
          ? "textarea"
          : "text",
        optional: true,
      },
    ]),
  );
  const body = output.trim()
    ? output
    : [...values.keys()]
        .map((name) => {
          const label = name.replaceAll("\\", "\\\\").replaceAll("{{", "\\{{");
          return `${label}: {{${JSON.stringify(name)}}}`;
        })
        .join("\n");
  const header = `--- veraflow 2\n${JSON.stringify(
    {
      title,
      workflow: "form",
      "verify-by-default": false,
      fields,
      responses: Object.fromEntries(values),
    },
    null,
    2,
  )}\n---\n`;
  const content = header + body;
  if (new TextEncoder().encode(content).length > recordInputLimit)
    throw Error("recordInputLimit");
  let source: ReturnType<typeof parseSource>;
  try {
    source = parseSource(content);
  } catch (error) {
    // The output editor only shows the body, so refer to lines in that editor.
    const headerLines = header.split("\n").length - 1;
    if (
      error instanceof SourceSyntaxError &&
      error.line &&
      error.line > headerLines
    )
      throw new SourceSyntaxError(error.detail, error.line - headerLines);
    throw error;
  }
  for (const name of source.fields)
    if (!values.has(name)) throw Error("recordUnknownField:" + name);
  return content;
}

export function planRecordValues(
  session: Session,
  values: ReadonlyMap<string, string | null>,
) {
  const indices = new Map(
    session.fields.map((field, index) => [field.name, index]),
  );
  const changes: {
    index: number;
    previous: string | null;
    value: string | null;
  }[] = [];
  for (const [name, value] of values) {
    const index = indices.get(name);
    if (index === undefined) throw Error("recordUnknownField:" + name);
    const field = session.fields[index];
    const control = session.controls?.get(field.name);
    const incoming = value === null ? null : normalizeText(control, value);
    if (
      incoming !== null &&
      (incoming.includes("\0") ||
        incoming.length > 1024 * 1024 ||
        (control && !validStoredValue(control, incoming)))
    )
      throw Error("recordInvalidField:" + field.name);
    const previous = field.status === "skipped" ? "" : field.value;
    if (previous !== incoming)
      changes.push({ index, previous, value: incoming });
  }
  return changes;
}
