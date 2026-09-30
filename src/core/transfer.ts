import type { Comparison, Template } from "./model";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw Error("invalidImport");
}
function string(v: unknown, max = 1024 * 1024): string {
  if (typeof v !== "string" || v.length > max) throw Error("invalidImport");
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw Error("invalidImport");
  return v;
}
function comparison(v: unknown): Comparison {
  if (!object(v)) throw Error("invalidImport");
  keys(v, ["mode", "caseSensitive", "unicode", "punctuation", "collapseLines"]);
  if (v.mode !== "exact" && v.mode !== "whitespace")
    throw Error("invalidImport");
  return {
    mode: v.mode,
    caseSensitive: bool(v.caseSensitive),
    unicode: bool(v.unicode),
    punctuation: bool(v.punctuation),
    collapseLines: bool(v.collapseLines),
  };
}
export function parseTemplateArchive(json: string): Template[] {
  if (new TextEncoder().encode(json).length > 16 * 1024 * 1024)
    throw Error("invalidImport");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw Error("invalidImport");
  }
  if (!object(value)) throw Error("invalidImport");
  keys(value, ["format", "version", "templates"]);
  if (
    value.format !== "veraflow-templates" ||
    value.version !== 1 ||
    !Array.isArray(value.templates) ||
    !value.templates.length ||
    value.templates.length > 1000
  )
    throw Error("invalidImport");
  return value.templates.map((v) => {
    if (!object(v)) throw Error("invalidImport");
    keys(v, [
      "id",
      "name",
      "folder",
      "content",
      "fieldOrder",
      "verificationEnabled",
      "comparison",
      "email",
      "placeholderStyle",
    ]);
    if (!Array.isArray(v.fieldOrder) || v.fieldOrder.length > 10000)
      throw Error("invalidImport");
    const t: Template = {
      id: string(v.id, 1000),
      name: string(v.name, 250),
      folder: string(v.folder, 250),
      content: string(v.content),
      fieldOrder: v.fieldOrder.map((n) => string(n, 1000)),
      verificationEnabled: bool(v.verificationEnabled),
      comparison: comparison(v.comparison),
    };
    if (!t.name.trim()) throw Error("invalidImport");
    if (v.placeholderStyle !== undefined) {
      if (v.placeholderStyle !== "angle" && v.placeholderStyle !== "braces")
        throw Error("invalidImport");
      t.placeholderStyle = v.placeholderStyle;
    }
    if (v.email !== undefined) {
      if (!object(v.email)) throw Error("invalidImport");
      const e = v.email;
      keys(e, [
        "enabled",
        "subject",
        "to",
        "cc",
        "bcc",
        "ccEnabled",
        "bccEnabled",
      ]);
      t.email = {
        enabled: bool(e.enabled),
        subject: string(e.subject),
        to: string(e.to),
        cc: string(e.cc),
        bcc: string(e.bcc),
        ccEnabled: bool(e.ccEnabled),
        bccEnabled: bool(e.bccEnabled),
      };
    }
    return t;
  });
}
export function exportTemplateArchive(templates: Template[]): string {
  return (
    JSON.stringify(
      { format: "veraflow-templates", version: 1, templates },
      null,
      2,
    ) + "\n"
  );
}
