import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  renderSession,
  renderTemplateValues,
  renderEmail,
  startSession,
  prepareWorkflow,
} from "../src/core/session";
import { renderTemplate } from "../src/core/template";
import {
  parseTemplateArchive,
  exportTemplateArchive,
} from "../src/core/transfer";
import {
  emptyWorkspace,
  exportWorkspace,
  importWorkspace,
} from "../src/core/workspace";
import { csvTable, parseCSV } from "../src/core/csv";

const file = (name: string) =>
  readFileSync(
    new URL(`../examples/portable/${name}`, import.meta.url),
    "utf8",
  );
const cases = JSON.parse(file("cases.json")) as {
  name: string;
  text?: string;
  archive?: string;
  values: Record<string, string>;
  output?: string;
  parts?: ReturnType<typeof renderEmail>;
  error?: string;
}[];

for (const fixture of cases)
  test(`portable renderer: ${fixture.name}`, () => {
    const values = new Map(Object.entries(fixture.values));
    const evaluate = () => {
      if (!fixture.archive)
        return renderTemplate(fixture.text!, values, "braces");
      const templates = parseTemplateArchive(file(fixture.archive));
      const [definition] = parseTemplateArchive(
        exportTemplateArchive(templates),
      );
      return renderTemplateValues(definition, values);
    };
    if (fixture.error) assert.throws(evaluate, { message: fixture.error });
    else assert.deepEqual(evaluate(), fixture.parts ?? fixture.output);
  });

test("saved records render like session values and workspace merges preserve relationships", () => {
  const [template] = parseTemplateArchive(file("booking-template.json"));
  const imported = importWorkspace(
    file("booking-workspace.json"),
    emptyWorkspace(),
  );
  const [table] = imported.tables;
  assert.equal(Object.hasOwn(table.rows[0].values, "note"), false);
  assert.equal(table.rows[2].values.note, "");
  const s = startSession(template);
  for (const field of s.fields) {
    field.value = table.rows[1].values[field.name] ?? null;
    field.status = field.value === null ? "empty" : "captured";
  }
  prepareWorkflow(s, true);
  assert.deepEqual(
    renderEmail(s),
    renderTemplateValues(
      template,
      new Map(Object.entries(table.rows[1].values)),
    ),
  );
  prepareWorkflow(s, false);
  assert.deepEqual(
    renderEmail(s),
    cases.find((c) => c.name === "conditional field visible")!.parts,
  );
  assert.equal(
    renderSession(s),
    renderEmail(s).find((p) => p.key === "body")!.text,
  );
  const merged = importWorkspace(exportWorkspace(imported), imported);
  assert.notEqual(merged.tables[1].id, table.id);
  assert.notEqual(merged.tables[1].rows[0].id, table.rows[0].id);
  assert.equal(merged.tables[1].folderId, merged.folders[1].id);
  assert.equal(merged.snippets![1].tableId, merged.tables[1].id);
  assert.deepEqual(merged.tables[1].externalIds, table.externalIds);
  assert.deepEqual(
    merged.tables[1].rows.map((row) => row.values),
    table.rows.map((row) => row.values),
  );
  const csv = csvTable(parseCSV(file("bookings.csv")), true, "Bookings");
  assert.equal(csv.rows[0].values.note, "");
  assert.deepEqual(csv.rows[1].values, table.rows[1].values);
});
