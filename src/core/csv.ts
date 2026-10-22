import { fieldNames, veraId, type DataTable } from "./workspace";
// CSV is text only: formulas, links and macros are never evaluated.
export function parseCSV(source: string, delimiter?: string): string[][] {
  if (
    new TextEncoder().encode(source).length > 16 * 1024 * 1024 ||
    source.includes("\0")
  )
    throw Error("invalidCSV");
  source = source.replace(/^\uFEFF/, "");
  if (!delimiter) {
    const counts = new Map([
      [",", 0],
      [";", 0],
      ["\t", 0],
    ]);
    let quoted = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === '"') {
        if (quoted && source[i + 1] === '"') {
          i++;
          continue;
        }
        quoted = !quoted;
      }
      if (!quoted) {
        if (c === "\r" || c === "\n") break;
        if (counts.has(c)) counts.set(c, counts.get(c)! + 1);
      }
    }
    delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (![",", ";", "\t"].includes(delimiter)) throw Error("invalidCSV");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const cell = () => {
    if (value.length > 1024 * 1024 || row.length >= 1000)
      throw Error("invalidCSV");
    row.push(value);
    value = "";
    closed = false;
  };
  const line = () => {
    cell();
    if (row.some((v) => v !== "")) rows.push(row);
    if (rows.length > 10001) throw Error("invalidCSV");
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
      continue;
    }
    if (c === delimiter) {
      cell();
      continue;
    }
    if (c === "\r" || c === "\n") {
      line();
      if (c === "\r" && source[i + 1] === "\n") i++;
      continue;
    }
    if (c === '"') {
      if (value || closed) throw Error("invalidCSV");
      quoted = true;
      continue;
    }
    if (closed) throw Error("invalidCSV");
    value += c;
  }
  if (quoted) throw Error("invalidCSV");
  if (value || row.length || closed) line();
  if (!rows.length) throw Error("invalidCSV");
  const width = rows[0].length;
  if (rows.some((r) => r.length !== width)) throw Error("csvColumns");
  return rows;
}
export function suggestHeader(rows: string[][]): boolean {
  const first = rows[0];
  return (
    !!first &&
    first.every((n) => n.trim() && !/^[\d\s.,+\-/]+$/.test(n)) &&
    new Set(first.map((n) => n.trim())).size === first.length
  );
}
export function csvTable(
  rows: string[][],
  header: boolean,
  name: string,
  folderId = "",
): DataTable {
  if (
    !rows.length ||
    !name.trim() ||
    rows.some((r) => r.length !== rows[0].length)
  )
    throw Error("invalidCSV");
  const used = new Set<string>();
  const fields = rows[0].map((raw, i) => {
    let base = header ? raw.trim() : `Column ${i + 1}`;
    try {
      const checked = fieldNames(base);
      if (checked.length !== 1 || checked[0] !== base)
        throw Error("invalidCSV");
    } catch {
      base = `Column ${i + 1}`;
    }
    let unique = base,
      suffix = 2;
    while (used.has(unique)) unique = `${base.slice(0, 240)} ${suffix++}`;
    used.add(unique);
    return unique;
  });
  fieldNames(fields.join("\n"));
  const data = header ? rows.slice(1) : rows;
  if (data.length > 10000) throw Error("invalidCSV");
  // Estimate encoded JSON before expanding repeated column names into objects.
  // A small CSV with very long headers can otherwise become an enormous archive.
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  const keyBytes = fields.reduce(
    (sum, n) => sum + bytes(JSON.stringify(n)) + 2,
    0,
  );
  let size = bytes(JSON.stringify(fields)) + 4096;
  for (const row of data) {
    size += keyBytes + 256;
    for (const value of row) size += bytes(JSON.stringify(value));
    if (size > 16 * 1024 * 1024) throw Error("invalidCSV");
  }
  return {
    id: veraId(),
    name: name.trim(),
    folderId,
    fields,
    rowTitles: false,
    output: "",
    externalIds: [],
    rows: data.map((values) => ({
      id: veraId(),
      title: "",
      externalIds: [],
      values: Object.fromEntries(fields.map((n, i) => [n, values[i]])),
    })),
  };
}
