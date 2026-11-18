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
  const timestamp =
    new Date().toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
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
  );
}
