const token = /\{\{([^{}]+)\}\}/g;

export function filenamePatternError(pattern: string, fields: Set<string>) {
  if (!pattern.trim() || pattern.length > 250)
    return "Use a filename pattern of 1–250 characters.";
  for (const match of pattern.matchAll(token)) {
    const name = match[1].trim();
    if (
      !["timestamp", "template_name", "workflow_name", "output_name"].includes(
        name,
      ) &&
      !templateVariable(name) &&
      !(name.startsWith("field.") && fields.has(name.slice(6)))
    )
      return `Unknown filename placeholder "${name}".`;
  }
  if (/[{}]/.test(pattern.replace(token, "")))
    return "Close filename placeholders with }}.";
}

export function suggestedFilename(
  pattern: string,
  values: ReadonlyMap<string, string>,
  extension: "veraflow" | "json" | "txt",
  context?: TemplateContext,
) {
  const sanitized = pattern
    .replace(token, (_, key: string) => {
      const name = key.trim();
      const variable = templateVariable(name);
      return variable
        ? (variableValue(variable, context) ?? "")
        : (values.get(name) ?? "");
    })
    .replace(/[^\p{L}\p{N}_-]+/gu, "-");
  let stem =
    Array.from(sanitized)
      .slice(0, 60)
      .join("")
      .replace(/^[-_]+|[-_]+$/g, "") || "VeraFlow";
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) stem = "_" + stem;
  return `${stem}.${extension}`;
}
import {
  templateVariable,
  variableValue,
  type TemplateContext,
} from "./variables";
