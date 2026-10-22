import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, suggestHeader, csvTable } from "../src/core/csv";
import { parseFields, renderTemplate } from "../src/core/template";
import { scannerTemplateParts, validateWorkspace } from "../src/core/workspace";
test("CSV supports BOM, quoted delimiters, escaped quotes and multiline addresses", () => {
  const rows = parseCSV(
    '\uFEFFFull name,Address\r\n"Alex, Morgan","Line 1\r\nLine ""2"""\r\n',
  );
  assert.deepEqual(rows, [
    ["Full name", "Address"],
    ["Alex, Morgan", 'Line 1\r\nLine "2"'],
  ]);
  assert.ok(suggestHeader(rows));
  const t = csvTable(rows, true, "Trips");
  assert.deepEqual(t.fields, ["Full name", "Address"]);
  assert.equal(t.rows[0].values.Address, 'Line 1\r\nLine "2"');
  assert.ok(validateWorkspace({ folders: [], tables: [t] }));
});
test("CSV header override preserves the first data row and detects tab/semicolon text", () => {
  const rows = parseCSV("104;Paris\n105;Tokyo");
  assert.equal(suggestHeader(rows), false);
  const t = csvTable(rows, false, "Trips");
  assert.deepEqual(t.fields, ["Column 1", "Column 2"]);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].values["Column 1"], "104");
  assert.deepEqual(parseCSV("Name\tCity\nAlex\tParis"), [
    ["Name", "City"],
    ["Alex", "Paris"],
  ]);
});
test("CSV makes blank, duplicate and invalid header names unique without losing column values", () => {
  const t = csvTable(
    parseCSV("Name,Name,,{{bad}}\nAlex,Morgan,104,keep"),
    true,
    "Trips",
  );
  assert.deepEqual(t.fields, ["Name", "Name 2", "Column 3", "Column 4"]);
  assert.deepEqual(Object.values(t.rows[0].values), [
    "Alex",
    "Morgan",
    "104",
    "keep",
  ]);
});
test("CSV rejects malformed quotes, ragged rows, unsupported delimiter, NUL and too many columns", () => {
  for (const text of [
    '"unclosed',
    '"closed"junk',
    'bad"quote',
    "a,b\nc",
    "a\0,b",
    Array(1002).fill("x").join(","),
  ])
    assert.throws(() => parseCSV(text));
  assert.throws(() => parseCSV("a|b", "|"));
});
test("CSV formulas and HTML remain literal strings and never become identities", () => {
  const t = csvTable(
    parseCSV("Value,Text\n=1+1,<script>alert(1)</script>"),
    true,
    "Literal",
  );
  assert.equal(t.rows[0].values.Value, "=1+1");
  assert.ok(t.rows[0].id.startsWith("VF-"));
  assert.equal(t.rows[0].values.Text, "<script>alert(1)</script>");
});
test("brace placeholders support internal spaces and trim delimiter padding consistently", () => {
  const source =
    "Hello {{ full name }} / {{booking reference}} / {{full name}}";
  assert.deepEqual(parseFields(source, "braces"), [
    "full name",
    "booking reference",
  ]);
  assert.equal(
    renderTemplate(
      source,
      new Map([
        ["full name", "Alex"],
        ["booking reference", "104"],
      ]),
      "braces",
    ),
    "Hello Alex / 104 / Alex",
  );
  assert.deepEqual(
    scannerTemplateParts(source)
      .filter((p) => p.name)
      .map((p) => p.name),
    ["full name", "booking reference", "full name"],
  );
  assert.deepEqual(
    parseFields("{{bad\nname}} {{bad\tname}} {{   }}", "braces"),
    [],
  );
  assert.deepEqual(parseFields("<bad name>"), []);
  assert.equal(renderTemplate("{{   }}", new Map(), "braces"), "{{   }}");
  assert.deepEqual(parseFields("\\{{full name}}", "braces"), []);
});
test("CSV sanitizes multiline headers and rejects oversized expanded row objects before allocation", () => {
  assert.deepEqual(
    csvTable(parseCSV('"Full\nname",Ref\nAlex,104'), true, "Trips").fields,
    ["Column 1", "Ref"],
  );
  const headers = Array.from({ length: 1000 }, (_, i) => "x".repeat(245) + i);
  const rows = [
    headers,
    ...Array.from({ length: 100 }, () => Array(1000).fill("a")),
  ];
  assert.throws(() => csvTable(rows, true, "Large"), /invalidCSV/);
});
