import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultComparison, type Template } from "../src/core/model";
import {
  activeSourceFields,
  prepareSections,
  renderTemplateValues,
  startSession,
  capture,
} from "../src/core/session";
import { parseSource, prefillSource } from "../src/core/source";
import {
  exportTemplateArchive,
  parseTemplateArchive,
} from "../src/core/transfer";

const source = readFileSync(
  new URL("../examples/source/rma.veraflow", import.meta.url),
  "utf8",
);
const template = (content: string): Template => ({
  id: "source",
  name: "Source",
  folder: "",
  placeholderStyle: "source",
  content,
  fieldOrder: [],
  verificationEnabled: false,
  comparison: defaultComparison,
});
const values = new Map(
  Object.entries({
    ticket_id: "123456",
    subject: "Replacement",
    "address-line-1": "25 Example Road",
    city: "Portland",
    state: "OR",
    zip: "97201",
  }),
);

test("plain source substitutes literally without a header", () => {
  const doc = template(String.raw`Hello {{name}} \{{name}}`);
  assert.deepEqual(
    renderTemplateValues(doc, new Map([["name", "{{other}}"]])),
    [{ id: "body", label: "Body", text: "Hello {{other}} {{name}}" }],
  );
});

test("Boolean routing, optional address line and section order survive JSON exchange", () => {
  const [doc] = parseTemplateArchive(exportTemplateArchive([template(source)]));
  assert.deepEqual(renderTemplateValues(doc, values), [
    { id: "to", label: "To", text: "dispatch@example.test" },
    { id: "subject", label: "Subject", text: "[RMA] [TKT-123456] Replacement" },
    {
      id: "address",
      label: "Address",
      text: "25 Example Road\nPortland, OR 97201",
    },
  ]);
  const session = startSession(doc);
  for (const [name, value] of [
    ...values,
    ["doa", "true"],
    ["attn", "Receiving"],
  ]) {
    session.active = session.fields.findIndex((field) => field.name === name);
    capture(session, value, false);
  }
  assert.deepEqual(
    prepareSections(session),
    renderTemplateValues(
      doc,
      new Map([...values, ["doa", "true"], ["attn", "Receiving"]]),
    ),
  );
  assert.equal(
    prepareSections(session).at(-1)?.text,
    "25 Example Road\nAttn: Receiving\nPortland, OR 97201",
  );
  assert.throws(
    () => renderTemplateValues(doc, new Map([...values, ["doa", "yes"]])),
    /invalidControlValue/,
  );
  assert.deepEqual(
    renderTemplateValues(doc, new Map([...values, ["attn", "  "]])),
    renderTemplateValues(doc, values),
  );
});

test("selected block alone requires its values and invalid source is rejected", () => {
  const header = '--- veraflow 2\n{"fields":{"doa":{"type":"boolean"}}}\n---\n';
  const doc = template(
    header + "{{#when doa}}\n{{reason}}\n{{else}}\nReady\n{{/when}}\n",
  );
  assert.deepEqual([...activeSourceFields(startSession(doc))!], ["doa"]);
  assert.equal(
    renderTemplateValues(doc, new Map([["doa", "false"]]))[0].text,
    "Ready\n",
  );
  assert.throws(
    () => renderTemplateValues(doc, new Map([["doa", "true"]])),
    /missingValue/,
  );
  assert.throws(
    () => parseSource(header + "{{#when doa}}\nUnclosed"),
    /invalidSource/,
  );
  assert.throws(
    () => parseSource(header + '{{when missing: "Invalid"}}'),
    /invalidSource/,
  );
});

test("source workflow is optional and leaves rendering unchanged", () => {
  const content = "Hello {{name}}";
  const values = new Map([["name", "Alex"]]);
  assert.equal(parseSource(content).workflow, undefined);
  for (const workflow of ["form", "scanner"]) {
    const source = `--- veraflow 2\n${JSON.stringify({ workflow })}\n---\n${content}`;
    assert.equal(parseSource(source).workflow, workflow);
    assert.deepEqual(
      renderTemplateValues(template(source), values),
      renderTemplateValues(template(content), values),
    );
  }
  assert.throws(() =>
    parseSource('--- veraflow 2\n{"workflow":"other"}\n---\nHello'),
  );
});

test("declared text line rules apply to capture, seed values, and portable rendering", () => {
  const doc = template(`--- veraflow 2
{"fields":{
  "ticket":{"type":"text","label":"Ticket #","default":"A-104"},
  "address":{"type":"text","multiline":true,"allowBlankLines":false},
  "notes":{"type":"textarea"}
}}
---
{{ticket}} — {{address}} — {{notes}}`);
  const valid = new Map([
    ["address", "100 Example Way\r\nExample City"],
    ["notes", "First paragraph\n\nSecond paragraph"],
  ]);
  assert.equal(
    renderTemplateValues(doc, valid)[0].text,
    "A-104 — 100 Example Way\r\nExample City — First paragraph\n\nSecond paragraph",
  );
  assert.throws(
    () => renderTemplateValues(doc, new Map([...valid, ["ticket", "A\n104"]])),
    /singleLineRequired/,
  );
  for (const address of ["A\n\nB", "A\r\n \r\nB", "A\n", "A\u2028\u2028B"]) {
    assert.throws(
      () =>
        renderTemplateValues(doc, new Map([...valid, ["address", address]])),
      /blankLinesProhibited/,
    );
  }
  const session = startSession(doc);
  assert.equal(session.fields[session.active].name, "address");
  assert.throws(() => capture(session, "A\n\nB"), /blankLinesProhibited/);
  assert.equal(session.fields[session.active].value, null);
  assert.throws(
    () =>
      parseSource(
        '--- veraflow 2\n{"fields":{"ticket":{"type":"text","default":"A\\nB"}}}\n---\n{{ticket}}',
      ),
    /invalidSource/,
  );
});

test("prefilled source reopens with editable values and preserves the original grammar", () => {
  const plain = String.raw`Hello {{name}} · {{when draft}} · \{{literal}}`;
  const responses = new Map([
    ["name", "李 {{literal}}"],
    ["when draft", ""],
  ]);
  const saved = prefillSource(plain, responses, "form");
  const doc = template(saved);
  assert.equal(parseSource(saved).workflow, "form");
  const session = startSession({ ...doc, verificationEnabled: true });
  assert.deepEqual(
    session.fields.map(({ value, status }) => [value, status]),
    [
      ["李 {{literal}}", "captured"],
      ["", "captured"],
    ],
  );
  const archive = exportTemplateArchive([doc]);
  assert.equal(
    parseSource(parseTemplateArchive(archive)[0].content).responses.size,
    0,
  );
  assert.doesNotMatch(archive, /李/);
  assert.equal(session.mode, "verify");
  assert.equal(
    renderTemplateValues(doc, new Map())[0].text,
    "Hello 李 {{literal}} ·  · {{literal}}",
  );
  assert.equal(
    renderTemplateValues(doc, new Map([["name", "Sam"]]))[0].text,
    "Hello Sam ·  · {{literal}}",
  );
});

test("prefilled source distinguishes an unanswered field from a template default", () => {
  const original =
    '--- veraflow 2\n{"fields":{"city":{"type":"text","default":"Portland"}}}\n---\n{{city}}';
  const saved = prefillSource(original, new Map([["city", null]]), "scanner");
  const doc = template(saved);
  assert.equal(startSession(doc).fields[0].value, null);
  assert.throws(() => renderTemplateValues(doc, new Map()), /missingValue/);
  assert.throws(
    () => prefillSource(original, new Map([["other", "data"]]), "form"),
    /invalidSource/,
  );
});

test("navigation is validated separately from rendered section text", () => {
  const section = (id: string) =>
    `{{#section ${id} "${id}"}}\n${id}\n{{/section}}`;
  const source = (delivery: unknown) =>
    `--- veraflow 2\n${JSON.stringify({ delivery })}\n---\n${section("first")}\n${section("last")}`;
  const content = source({
    mode: "sequence",
    after: { first: ["Tab", "Tab", "Shift+Tab"] },
  });
  assert.deepEqual(parseSource(content).delivery.after.get("first"), [
    "Tab",
    "Tab",
    "Shift+Tab",
  ]);
  assert.equal(parseSource(content).delivery.mode, "sequence");
  assert.deepEqual(
    renderTemplateValues(template(content), new Map()).map((part) => part.text),
    ["first", "last"],
  );
  for (const after of [
    { first: ["Enter"] },
    { last: ["Tab"] },
    { unknown: ["Tab"] },
    { first: Array(17).fill("Tab") },
  ]) {
    assert.throws(() => parseSource(source({ after })), /invalidSource/);
  }
});

test("source syntax errors identify malformed metadata and the opening line of an unclosed condition", () => {
  assert.throws(
    () =>
      parseSource(
        '--- veraflow 2\n{"fields":{"ready":{"type":"bool"}}}\n---\n{{ready}}',
      ),
    { detail: /Field "ready" needs a supported type/ },
  );
  assert.throws(
    () =>
      parseSource(
        '--- veraflow 2\n{"title":"Example","fields":{"flag":{"type":"boolean"}}}\n---\n{{#section body "Body"}}\n{{#when flag}}\n{{name}}\n{{/section}}',
      ),
    { line: 5, detail: /missing its closing/ },
  );
  assert.throws(
    () => parseSource('--- veraflow 2\n{ "title": "Example", }\n---\n{{name}}'),
    { line: 2, detail: /invalid JSON/ },
  );
});
