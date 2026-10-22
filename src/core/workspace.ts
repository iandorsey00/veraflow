import { tokens } from "./template";
import type { Session } from "./model";
export type ExternalId = { label: string; value: string };
export type DataRow = {
  id: string;
  title: string;
  externalIds: ExternalId[];
  values: Record<string, string>;
};
export type DataTable = {
  id: string;
  name: string;
  folderId: string;
  fields: string[];
  rowTitles: boolean;
  output: string;
  externalIds: ExternalId[];
  rows: DataRow[];
};
export type Workspace = {
  folders: { id: string; name: string }[];
  tables: DataTable[];
};
export const emptyWorkspace = (): Workspace => ({ folders: [], tables: [] });
export const veraId = () => `VF-${crypto.randomUUID()}`;
export function fieldNames(text: string): string[] {
  const names = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !names.length ||
    names.length > 1000 ||
    new Set(names).size !== names.length ||
    names.some((n) => n.length > 250 || /[\p{Cc}\p{Cf}{}<>]/u.test(n))
  )
    throw Error("invalidFields");
  return names;
}
export function rowFromScanner(session: Session, title = ""): DataRow {
  if (session.fields.some((f) => f.status === "mismatch"))
    throw Error("scannerUnverified");
  return {
    id: veraId(),
    title,
    externalIds: [],
    values: Object.fromEntries(
      session.fields
        .filter(
          (f) =>
            f.value !== null &&
            f.status !== "mismatch" &&
            f.status !== "skipped",
        )
        .map((f) => [f.name, f.value!]),
    ),
  };
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function keys(
  x: unknown,
  allowed: string[],
): asserts x is Record<string, unknown> {
  if (
    !object(x) ||
    Object.keys(x).some((k) => !allowed.includes(k)) ||
    allowed.some((k) => !(k in x))
  )
    throw Error("invalidImport");
}
const text = (x: unknown, max = 1000): x is string =>
  typeof x === "string" && x.length <= max;
const id = (x: unknown): x is string =>
  text(x, 100) && /^VF-[a-f0-9-]{36}$/i.test(x);
function refs(x: unknown) {
  if (!Array.isArray(x) || x.length > 50) throw Error("invalidImport");
  for (const r of x) {
    keys(r, ["label", "value"]);
    if (!text(r.label, 250) || !r.label.trim() || !text(r.value))
      throw Error("invalidImport");
  }
}
export function validateWorkspace(value: unknown): Workspace {
  keys(value, ["folders", "tables"]);
  if (
    !Array.isArray(value.folders) ||
    !Array.isArray(value.tables) ||
    value.folders.length > 1000 ||
    value.tables.length > 1000
  )
    throw Error("invalidImport");
  const ids = new Set<string>();
  const take = (v: unknown) => {
    if (!id(v) || ids.has(v)) throw Error("invalidImport");
    ids.add(v);
  };
  for (const f of value.folders) {
    keys(f, ["id", "name"]);
    take(f.id);
    if (!text(f.name) || !f.name.trim()) throw Error("invalidImport");
  }
  for (const t of value.tables) {
    keys(t, [
      "id",
      "name",
      "folderId",
      "fields",
      "rowTitles",
      "output",
      "externalIds",
      "rows",
    ]);
    take(t.id);
    if (
      !text(t.name) ||
      !t.name.trim() ||
      !text(t.folderId) ||
      (t.folderId !== "" && !value.folders.some((f) => f.id === t.folderId)) ||
      !Array.isArray(t.fields) ||
      !t.fields.every((n) => text(n, 250)) ||
      typeof t.rowTitles !== "boolean" ||
      !text(t.output, 1024 * 1024) ||
      !Array.isArray(t.rows) ||
      t.rows.length > 10000
    )
      throw Error("invalidImport");
    const tableFields = t.fields as string[];
    if (tableFields.length) {
      const names = fieldNames(tableFields.join("\n"));
      if (names.some((n, i) => n !== tableFields[i]))
        throw Error("invalidImport");
    }
    refs(t.externalIds);
    for (const r of t.rows) {
      keys(r, ["id", "title", "externalIds", "values"]);
      take(r.id);
      refs(r.externalIds);
      if (
        !text(r.title) ||
        !object(r.values) ||
        Object.entries(r.values).some(
          ([n, v]) => !tableFields.includes(n) || !text(v, 1024 * 1024),
        )
      )
        throw Error("invalidImport");
    }
  }
  return structuredClone(value) as Workspace;
}
export function exportWorkspace(workspace: Workspace): string {
  validateWorkspace(workspace);
  return JSON.stringify(
    { format: "veraflow-workspace", version: 1, workspace },
    null,
    2,
  );
}
export function importWorkspace(json: string, current: Workspace): Workspace {
  if (new TextEncoder().encode(json).length > 16 * 1024 * 1024)
    throw Error("invalidImport");
  const data: unknown = JSON.parse(json);
  keys(data, ["format", "version", "workspace"]);
  if (data.format !== "veraflow-workspace" || data.version !== 1)
    throw Error("invalidImport");
  const incoming = validateWorkspace(data.workspace),
    all = new Set([
      ...current.folders.map((f) => f.id),
      ...current.tables.flatMap((t) => [t.id, ...t.rows.map((r) => r.id)]),
    ]);
  // Preserve identities on a clean import; remap conflicts rather than overwrite saved work.
  const remap = new Map<string, string>();
  for (const old of [
    ...incoming.folders.map((f) => f.id),
    ...incoming.tables.flatMap((t) => [t.id, ...t.rows.map((r) => r.id)]),
  ]) {
    remap.set(old, all.has(old) ? veraId() : old);
  }
  for (const f of incoming.folders) f.id = remap.get(f.id)!;
  for (const t of incoming.tables) {
    t.id = remap.get(t.id)!;
    t.folderId = remap.get(t.folderId) ?? "";
    for (const r of t.rows) r.id = remap.get(r.id)!;
  }
  return validateWorkspace({
    folders: [...current.folders, ...incoming.folders],
    tables: [...current.tables, ...incoming.tables],
  });
}
export function exportScanner(
  session: Session,
  includeValues: boolean,
): string {
  return JSON.stringify(
    {
      format: "veraflow-scanner",
      version: 1,
      fields: session.fields.map((f) => ({
        name: f.name,
        ...(includeValues
          ? { value: f.status === "mismatch" ? null : f.value }
          : {}),
      })),
      output: session.scannerOutputTemplate ?? "",
    },
    null,
    2,
  );
}
export function importScanner(json: string): {
  fields: { name: string; value: string | null }[];
  output: string;
} {
  if (new TextEncoder().encode(json).length > 16 * 1024 * 1024)
    throw Error("invalidImport");
  const x: unknown = JSON.parse(json);
  keys(x, ["format", "version", "fields", "output"]);
  if (
    x.format !== "veraflow-scanner" ||
    x.version !== 1 ||
    !Array.isArray(x.fields) ||
    !text(x.output, 1024 * 1024)
  )
    throw Error("invalidImport");
  const fields = x.fields.map((f) => {
    if (
      !object(f) ||
      Object.keys(f).some((k) => !["name", "value"].includes(k)) ||
      !text(f.name, 250) ||
      ("value" in f && f.value !== null && !text(f.value, 1024 * 1024))
    )
      throw Error("invalidImport");
    return { name: f.name, value: (f.value ?? null) as string | null };
  });
  const names = fieldNames(fields.map((f) => f.name).join("\n"));
  if (names.some((n, i) => n !== fields[i].name)) throw Error("invalidImport");
  return { fields, output: x.output };
}
export function scannerTemplateParts(
  content: string,
): { text: string; name?: string }[] {
  return tokens(content, "braces");
}
