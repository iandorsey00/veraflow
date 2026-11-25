import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultComparison, type Template } from "../src/core/model";
import {
  activeSourceFields,
  applyRecordChanges,
  prepareSections,
  spreadsheetRow,
  renderTemplateValues,
  startSession,
  capture,
  prepareWorkflow,
  beginReverification,
  verify,
} from "../src/core/session";
import {
  planRecordValues,
  readRecordInput,
  recordFormSource,
} from "../src/core/source-record";
import {
  parseSource,
  prefillSource,
  sourceDefinitionText,
  sourceParts,
} from "../src/core/source";
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
  for (const [address, normalized] of [
    ["A\n\nB", "A\nB"],
    ["A\r\n \r\nB", "A\nB"],
    ["A\n", "A"],
    ["A\u2028\u2028B", "A\nB"],
  ]) {
    assert.equal(
      renderTemplateValues(doc, new Map([...valid, ["address", address]]))[0]
        .text,
      `A-104 — ${normalized} — First paragraph\n\nSecond paragraph`,
    );
  }
  const session = startSession(doc);
  assert.equal(session.fields[session.active].name, "address");
  capture(session, "A\n\nB", false);
  assert.equal(session.fields[session.active].value, "A\nB");
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
    () =>
      parseSource('--- veraflow 2\n{ "title": : "Example" }\n---\n{{name}}'),
    { line: 2, detail: /invalid JSON/ },
  );
});

test("multiline inline conditions interpolate selected branches and preserve literal values", () => {
  const doc = template(
    readFileSync(
      new URL("../examples/source/inline-greeting.veraflow", import.meta.url),
      "utf8",
    ),
  );
  const parts = renderTemplateValues(
    doc,
    new Map([
      ["formal", "true"],
      ["Name", "Alex {{other}}"],
    ]),
  );
  assert.deepEqual(
    parts.map(({ text }) => text),
    [
      '"Joe Sample" <joe.sample@example.com>',
      "Hello Alex {{other}}, your order is ready.",
    ],
  );
  assert.equal(
    renderTemplateValues(doc, new Map())[1].text,
    "Hello, your order is ready.",
  );
  assert.equal(parseSource(doc.content).delivery.separator, "\n\n");

  const escaped = template(String.raw`--- veraflow 2
{}
---
{{when x is blank: 'It\'s \\{{literal}}' else: "{{missing}}"}}`);
  assert.equal(
    renderTemplateValues(escaped, new Map())[0].text,
    "It's {{literal}}",
  );
  assert.throws(
    () => renderTemplateValues(escaped, new Map([["x", "value"]])),
    /missingValue/,
  );
});

test("named outputs render independently from one record", () => {
  const content = readFileSync(
    new URL("../examples/source/shared-record.veraflow", import.meta.url),
    "utf8",
  );
  const doc = template(content);
  const record = new Map([
    ["Reference", "A-01"],
    ["Contact", "Alex"],
  ]);
  assert.deepEqual(
    parseSource(content).outputs.map(({ id }) => id),
    ["note", "row"],
  );
  assert.ok(activeSourceFields(startSession(doc))?.has("InternalNote"));
  assert.equal(
    renderTemplateValues(doc, record, "row")[0].text,
    "A-01\tAlex\tPending",
  );
  assert.equal(
    renderTemplateValues(doc, record, "note")[0].text,
    "Hello Alex,\nBooking A-01 is pending.",
  );
  const partial = template(`--- veraflow 2
{}
---
{{#output a "A"}}
{{value}}
{{/output}}
{{#output b "B"}}
{{other}}
{{/output}}`);
  assert.equal(
    renderTemplateValues(partial, new Map([["other", "present"]]), "b")[0].text,
    "present",
  );
  assert.throws(
    () => renderTemplateValues(partial, new Map(), "b"),
    /missingValue/,
  );
});

test("else if short-circuits branches and not only matches a false Boolean", () => {
  const header =
    '--- veraflow 2\n{"fields":{"ready":{"type":"boolean"},"review":{"type":"boolean"}}}\n---\n';
  const source = template(
    header +
      "{{when not ready: 'Hold' else if review: 'Review' else: 'Ready'}}\n{{#when not ready}}\nHold\n{{else if review}}\nReview\n{{else}}\nReady\n{{/when}}",
  );
  assert.equal(
    renderTemplateValues(source, new Map([["ready", "false"]]))[0].text,
    "Hold\nHold\n",
  );
  assert.equal(
    renderTemplateValues(
      source,
      new Map([
        ["ready", "true"],
        ["review", "true"],
      ]),
    )[0].text,
    "Review\nReview\n",
  );
  assert.equal(
    renderTemplateValues(
      source,
      new Map([
        ["ready", "true"],
        ["review", "false"],
      ]),
    )[0].text,
    "Ready\nReady\n",
  );
  assert.throws(() => renderTemplateValues(source, new Map()), /missingValue/);
  assert.throws(
    () => parseSource(header + "{{when not unknown: 'x'}}"),
    /invalidSource/,
  );
});

test("source comments, text comparisons, local loops, and UTC variables share one render", () => {
  const doc = template(`--- veraflow 2
{"workflow":"csv","csv":{"file":"records.csv","rowLabel":"{{@row}} · {{Name}}"}}
---
{{! A comment between outputs is allowed. }}
{{#output note "Report"}}
{{! This entire line disappears. }}
{{@date "%Y-%m-%d %H:%M:%S %%"}}, row {{@row}} of {{@rows}} ({{@csv_file}}) {{@output}}{{! hidden }}
{{when Name equals 'Alex': 'Exact' else if Name contains "lex": 'Close'}}
{{#for item in ["Alex", "{{Name}}", true]}}
{{when item equals 'Alex': 'Local {{item}}' else: '{{item}}'}}
{{/for}}
{{#for n in range(1, 3)}}
{{n}}
{{/for}}
{{/output}}
`);
  const parsed = parseSource(doc.content);
  assert.deepEqual(parsed.fields, ["Name"]);
  const context = {
    timestamp: new Date("2026-11-18T21:04:05Z"),
    csv: { row: 2, rows: 7, file: "records.csv" },
  };
  assert.equal(
    parsed.csvLabel?.(new Map([["Name", "Alex"]]), context),
    "2 · Alex",
  );
  const expected =
    "2026-11-18 21:04:05 %, row 2 of 7 (records.csv) Report\nExact\nLocal Alex\n{{Name}}\ntrue\n1\n2\n";
  assert.equal(
    renderTemplateValues(doc, new Map([["Name", "Alex"]]), "note", context)[0]
      .text,
    expected,
  );
  assert.equal(
    renderTemplateValues(doc, new Map([["Name", "Alexa"]]), "note", context)[0]
      .text,
    expected.replace("Exact", "Close"),
  );
  assert.throws(
    () =>
      parseSource(
        "--- veraflow 2\n{}\n---\n{{#for n in range(101)}}\n{{n}}\n{{/for}}",
      ),
    /invalidSource/,
  );
  assert.throws(
    () =>
      parseSource(`--- veraflow 2
{}
---
{{#for x in range(100)}}
{{#for y in range(100)}}
{{#for z in range(100)}}
{{z}}
{{/for}}
{{/for}}
{{/for}}`),
    /invalidSource/,
  );
});

test("prefilled verification resumes in its originating workflow and clears on edit", () => {
  const saved = prefillSource(
    "Hello {{name}}",
    new Map([["name", "Alex"]]),
    "scanner",
    undefined,
    new Map([["name", "scanner"]]),
  );
  const doc = { ...template(saved), verificationEnabled: true };
  const scanner = startSession(doc);
  assert.equal(scanner.fields[0].status, "verified");
  assert.equal(prepareSections(scanner)[0].text, "Hello Alex");
  beginReverification(scanner);
  assert.equal(verify(scanner, "Alex"), true);
  capture(scanner, "Sam", false);
  assert.equal(scanner.fields[0].status, "captured");
  const form = startSession(doc);
  prepareWorkflow(form, true);
  assert.equal(form.fields[0].status, "captured");
  const definition = parseSource(sourceDefinitionText(saved));
  assert.equal(definition.responses.size, 0);
  assert.equal(definition.verification.size, 0);
});

test("named outputs accept nested delivery settings with inherited defaults", () => {
  const doc = `--- veraflow 2
{"delivery":{"mode":"sequence","separator":" | "},"outputs":{"note":{"delivery":{"after":{"first":["Tab"]}}}}}
---
{{#output note "Note"}}
{{#section first "First"}}
A
{{/section}}
{{#section second "Second"}}
B
{{/section}}
{{/output}}`;
  const delivery = parseSource(doc).outputs[0].delivery;
  assert.equal(delivery.mode, "sequence");
  assert.equal(delivery.separator, " | ");
  assert.deepEqual(delivery.after.get("first"), ["Tab"]);
});

test("spreadsheet row cells use template loops without creating extra records or fields", () => {
  const content = `--- veraflow 2
${JSON.stringify({
  outputs: {
    main: {
      row: {
        Ticket: "{{Reference}}",
        Steps:
          '{{#for task in ["Check label", "Confirm destination"]}}\n- {{task}}\n{{/for}}',
      },
    },
  },
})}
---
Ticket for {{Reference}}`;
  const s = startSession(template(content));
  assert.deepEqual(
    s.fields.map((field) => field.name),
    ["Reference"],
  );
  capture(s, "VF-104");
  assert.deepEqual(
    [...spreadsheetRow(s, ["Steps", "Ticket", "Other"])],
    [
      ["Ticket", "VF-104"],
      ["Steps", "- Check label\n- Confirm destination\n"],
    ],
  );
  assert.throws(() => spreadsheetRow(s, ["Ticket"]), /appendMissingColumn/);
});

test("snippet actions have stable IDs and interpolate literal selection without form fields", () => {
  const source = readFileSync(
    new URL("../examples/source/quick-snippets.veraflow", import.meta.url),
    "utf8",
  );
  const parsed = parseSource(source);
  assert.equal(parsed.snippets, true);
  assert.deepEqual(parsed.fields, []);
  assert.deepEqual(
    parsed.outputs.map(({ id }) => id),
    ["timestamp", "greeting", "acknowledgement"],
  );
  assert.deepEqual(
    sourceParts(parsed, new Map(), undefined, "greeting", {
      selectionOrClipboard: "A {{name}}",
    })[0].parts,
    [
      { text: "Hi ", missing: false },
      { text: "A {{name}}", missing: false },
    ],
  );
  for (const invalid of [
    source.replace("Hi {{@selection-or-clipboard}}", "Hi {{name}}"),
    source.replace("#action greeting", "#action timestamp"),
    source.replace("{{/action}}", "{{/output}}"),
  ])
    assert.throws(() => parseSource(invalid), /invalidSource/);
});

test("steps reject duplicate fields, missing assignments, and forward references", () => {
  const staged = readFileSync(
    new URL("../examples/source/shipment-steps.veraflow", import.meta.url),
    "utf8",
  );
  assert.equal(parseSource(staged).steps?.length, 3);
  assert.throws(
    () =>
      parseSource(staged.replace('["Tracking"]', '["Reference", "Tracking"]')),
    { detail: 'Field "Reference" is assigned to more than one step.' },
  );
  assert.throws(
    () =>
      parseSource(
        staged.replace('["Reference", "Recipient"]', '["Reference"]'),
      ),
    { detail: 'Output "dispatch" uses "Recipient" before its step.' },
  );
  assert.throws(
    () =>
      parseSource(
        staged
          .replace('["Delivered"]', "[]")
          .replace("{{Delivered}}", "Tuesday"),
      ),
    { detail: 'Field "Delivered" is missing from "steps".' },
  );
});

test("JSON5 headers accept comments and quoted keys while generated copies use strict JSON", () => {
  const header = String.raw`--- veraflow 2
{
  // Escapes, comments, and field keys are metadata only.
  title: 'Example // office',
  /*
---
  */
  fields: {'参考 #': {type: 'text', label: 'A\x42',},},
}
---
Hello {{参考 #}}.`;
  for (const source of [header, header.replaceAll("\n", "\r\n")]) {
    const parsed = parseSource(source);
    assert.equal(parsed.controls.get("参考 #")?.label, "AB");
    assert.equal(parsed.title, "Example // office");
    assert.equal(sourceDefinitionText(source), source);
    const saved = prefillSource(
      source,
      new Map([["参考 #", "VF-104"]]),
      "form",
    );
    assert.equal(
      JSON.parse(saved.split("\n---\n")[0].split("\n").slice(1).join("\n"))
        .title,
      parsed.title,
    );
    assert.deepEqual(
      prepareSections(startSession(template(saved)))[0].text,
      "Hello VF-104.",
    );
  }
  assert.throws(
    () =>
      parseSource(String.raw`--- veraflow 2
{fields:{ x:{type:'text', "\u0074ype":'text'}}}
---
Hi`),
    { line: 2, detail: /Duplicate metadata key "type"/ },
  );
  for (const number of ["NaN", "-Infinity", "1e400"])
    assert.throws(
      () => parseSource(`--- veraflow 2\n{title: ${number}}\n---\nHi`),
      /invalidSource/,
    );
  const safe = parseSource(
    "--- veraflow 2\n{fields:{__proto__:{type:'text'}}}\n---\nHello {{__proto__}}",
  );
  assert.equal(safe.controls.get("__proto__")?.kind, "text");
});

test("record merge preserves explicit emptiness and unchanged local verification", () => {
  const doc = template(`--- veraflow 2
{"fields":{"Reference":{"type":"text","verify":true},"Notes":{"type":"text","optional":true},"State":{"type":"text","default":"OR"}},"responses":{"Reference":"VF-104","Notes":"Old note"},"verification":{"Reference":"form"}}
---
{{Reference}} / {{Notes}} / {{State}}`);
  const session = startSession(doc);
  const changes = planRecordValues(
    session,
    readRecordInput('{"Reference":"VF-104","Notes":"","State":null}'),
  );
  assert.equal(changes.length, 2);
  applyRecordChanges(session, changes);
  assert.deepEqual(
    session.fields.map(({ value, status }) => [value, status]),
    [
      ["VF-104", "verified"],
      ["", "captured"],
      [null, "empty"],
    ],
  );
  assert.throws(
    () => planRecordValues(session, readRecordInput('{"Unknown":"data"}')),
    /recordUnknownField:Unknown/,
  );
  applyRecordChanges(
    session,
    planRecordValues(session, readRecordInput("{Reference: 'VF-105'}")),
  );
  assert.equal(session.fields[0].status, "captured");
});

test("JSON5 input keeps exact text and numbers in a generated form and output", () => {
  const values = readRecordInput(String.raw`{
    // Numbers can arrive from a generator, but their digits should not round.
    reference: '000184',
    amount: 9007199254740993.50,
    hex: -0xA,
    urgent: false,
    missing: null,
    empty: '',
    spaces: '  ',
    "literal {{name}}": '林晓 {{test}}\nSecond line',
    "__proto__": 'ordinary field',
  }`);
  assert.deepEqual(
    [...values.values()],
    [
      "000184",
      "9007199254740993.50",
      "-10",
      "false",
      null,
      "",
      "  ",
      "林晓 {{test}}\nSecond line",
      "ordinary field",
    ],
  );
  const form = startSession(template(recordFormSource("Dispatch", values, "")));
  assert.equal(form.fields.find(({ name }) => name === "missing")?.value, null);
  assert.equal(form.fields.find(({ name }) => name === "empty")?.value, "");
  assert.equal(
    prepareSections(form)[0].text,
    "reference: 000184\namount: 9007199254740993.50\nhex: -10\nurgent: false\nmissing: \nempty: \nspaces:   \nliteral {{name}}: 林晓 {{test}}\nSecond line\n__proto__: ordinary field",
  );
  const content = recordFormSource("Dispatch", values, "Ticket {{reference}}");
  assert.equal(
    prepareSections(startSession(template(content)))[0].text,
    "Ticket 000184",
  );
});

test("JSON input reports ambiguous or unsupported fields without inventing mappings", () => {
  assert.throws(() => readRecordInput("[]"), /recordInputObject/);
  assert.throws(() => readRecordInput("{}"), /recordInputObject/);
  assert.throws(
    () => readRecordInput(String.raw`{name: 'A', "\u006eame": 'B'}`),
    /recordInputDuplicate:name/,
  );
  assert.throws(
    () => readRecordInput("{items: []}"),
    /recordInputNested:items/,
  );
  assert.throws(
    () => readRecordInput("{fee: Infinity}"),
    /recordInputNumber:fee/,
  );
  assert.throws(
    () => readRecordInput("{\n reference: }"),
    /recordInputSyntax:2/,
  );
  assert.throws(
    () =>
      recordFormSource("Dispatch", readRecordInput("{name: 'A'}"), "{{typo}}"),
    /recordUnknownField:typo/,
  );
  assert.throws(
    () =>
      recordFormSource(
        "Dispatch",
        readRecordInput("{name: 'A'}"),
        "Hello\n{{name",
      ),
    { line: 2 },
  );
});
