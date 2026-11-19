import { fieldNames, veraId, type DataTable } from "./workspace";
// CSV is text only: formulas, links and macros are never evaluated.
export const maxCSVBytes = 64 * 1024 * 1024;
export const maxCSVRows = 100_000;

export function parseCSV(
  source: string,
  delimiter?: string,
  keepEmptyRows = false,
): string[][] {
  if (
    source.length > maxCSVBytes ||
    new TextEncoder().encode(source).length > maxCSVBytes
  )
    throw Error("csvTooLarge");
  if (source.includes("\0")) throw Error("invalidCSV");
  source = source.replace(/^\uFEFF/, "");
  delimiter ??= csvDialect(source).delimiter;
  if (![",", ";", "\t"].includes(delimiter)) throw Error("invalidCSV");
  const rows: string[][] = [];
  // A closed quoted cell must end at a separator, record break, or end of input.
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
    const explicitRecord = row.length > 0 || closed;
    cell();
    if (row.some((v) => v !== "") || (keepEmptyRows && explicitRecord))
      rows.push(row);
    if (rows.length > maxCSVRows + 1) throw Error("csvTooManyRows");
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
  // A short row is malformed. A present empty cell is a legitimate empty string.
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

export type CSVRecords = { headers: string[]; rows: string[][] };

export function csvRecords(source: string, allowEmpty = false): CSVRecords {
  const [headers, ...rows] = parseCSV(source, undefined, true);
  if (
    headers.some((name) => !name.trim()) ||
    new Set(headers).size !== headers.length
  )
    throw Error("csvHeaders");
  if (!rows.length && !allowEmpty) throw Error("csvNoRows");
  return { headers, rows };
}

export function csvRecord(data: CSVRecords, index: number) {
  return new Map(
    data.headers.map((name, column) => [name, data.rows[index][column]]),
  );
}

// Find the delimiter and record ending in the header, ignoring quoted cells.
export function csvDialect(source: string) {
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  let ending = "\r\n";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === "\r" || c === "\n") {
        ending = c === "\r" && source[i + 1] === "\n" ? "\r\n" : c;
        break;
      }
      if (counts.has(c)) counts.set(c, counts.get(c)! + 1);
    }
  }
  const [delimiter, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return {
    delimiter,
    ending,
    ambiguous:
      count > 0 && [...counts.values()].filter((n) => n === count).length > 1,
  };
}

export function spreadsheetText(value: string) {
  // Keep signed numbers numeric. Protect text that a spreadsheet might execute as a formula.
  return /^[\s\uFEFF]*[=+\-@]/u.test(value) &&
    !/^[+-](?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)
    ? "'" + value
    : value;
}

export function delimitedRow(cells: string[], delimiter: string) {
  return cells
    .map((value) =>
      value === "" || value.includes(delimiter) || /["\r\n]/u.test(value)
        ? '"' + value.replaceAll('"', '""') + '"'
        : value,
    )
    .join(delimiter);
}

export function planCSVAppend(
  source: string,
  data: CSVRecords,
  values: ReadonlyMap<string, string>,
  duplicateKey?: string,
) {
  const { headers, rows } = data;
  const { delimiter, ending, ambiguous } = csvDialect(source);
  if (ambiguous) throw Error("appendDialect");
  if (rows.length >= maxCSVRows) throw Error("csvTooManyRows");
  const matched = headers.filter((header) => values.has(header));
  if (!matched.length) throw Error("appendNoColumns");
  const cells = headers.map((header) => values.get(header) ?? "");
  if (!cells.some((value) => value.trim())) throw Error("appendEmptyRow");
  if (cells.some((c) => c.length > 1024 * 1024 || c.includes("\0")))
    throw Error("invalidCSV");
  const index = duplicateKey === undefined ? -1 : headers.indexOf(duplicateKey);
  if (duplicateKey !== undefined && (index < 0 || !cells[index].trim()))
    throw Error("appendDuplicateKey");
  const duplicate =
    index < 0 ? -1 : rows.findIndex((row) => row[index] === cells[index]);
  const suffix =
    (/[\r\n]$/u.test(source) ? "" : ending) +
    delimitedRow(cells, delimiter) +
    ending;
  return { cells, duplicate: duplicate + 1, row: rows.length + 1, suffix };
}
