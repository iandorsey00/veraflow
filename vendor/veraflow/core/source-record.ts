import { parse } from "@humanwhocodes/momoa";
import { normalizeText, validControlValue } from "./form";
import type { Session } from "./model";
import { parseSource, sourceOutput } from "./source";
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
  extension: "veraflow" | "json" | "txt",
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

export function planRecordMerge(session: Session, text: string) {
  let document: ReturnType<typeof parse>;
  try {
    document = parse(text);
  } catch {
    throw Error("invalidImport");
  }
  if (document.body.type !== "Object") throw Error("invalidImport");
  const values = new Map<string, string | null>();
  for (const { name, value } of document.body.members) {
    if (name.type !== "String" || values.has(name.value))
      throw Error("invalidImport");
    if (value.type !== "String" && value.type !== "Null")
      throw Error("invalidImport");
    values.set(name.value, value.type === "Null" ? null : value.value);
  }
  return planRecordValues(session, values);
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
        (control &&
          !(control.optional && incoming === "") &&
          !validControlValue(control, incoming)))
    )
      throw Error("recordInvalidField:" + field.name);
    const previous = field.status === "skipped" ? "" : field.value;
    if (previous !== incoming)
      changes.push({ index, previous, value: incoming });
  }
  return changes;
}
