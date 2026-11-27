import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultComparison } from "../src/core/model";
import { planRecordValues, readRecordInput } from "../src/core/source-record";
import {
  applyRecordChanges,
  prepareSections,
  prepareWorkflow,
  sectionText,
  startSession,
} from "../src/core/session";

const entry = fileURLToPath(new URL("../scripts/veraflow", import.meta.url));
const fixture = (name: string) =>
  fileURLToPath(new URL(`../examples/source/${name}`, import.meta.url));
const run = (args: string[], input?: string) =>
  spawnSync(process.execPath, [entry, ...args], { input, encoding: "utf8" });

test("CLI renders exactly the prepared Desktop résumé and accepts JSON5 on stdin", () => {
  const form = fixture("resume-pdf.vf");
  const record = fixture("resume-pdf.json");
  const session = startSession({
    id: "test",
    name: "Résumé PDF",
    content: readFileSync(form, "utf8"),
    comparison: defaultComparison,
    folder: "",
    fieldOrder: [],
    placeholderStyle: "source",
    verificationEnabled: true,
  });
  session.unifiedForm = true;
  prepareWorkflow(session, true);
  applyRecordChanges(
    session,
    planRecordValues(session, readRecordInput(readFileSync(record, "utf8"))),
  );
  const render = run(["render", record, form]);
  assert.equal(render.status, 0, render.stderr);
  assert.equal(render.stdout, sectionText(prepareSections(session)));
  const dispatch = run(
    ["render", "-", fixture("dispatch-report.vf")],
    readFileSync(fixture("dispatch-record.json5"), "utf8"),
  );
  assert.equal(dispatch.status, 0, dispatch.stderr);
  assert.match(dispatch.stdout, /Dispatch 000184/);
});

test("CLI requires a named output when ambiguous and honors a declared default", (t) => {
  const input = "{Reference:'0007', Contact:'林晓'}";
  const form = fixture("shared-record.veraflow");
  const ambiguous = run(["render", "-", form], input);
  assert.equal(ambiguous.status, 1);
  assert.equal(ambiguous.stdout, "");
  assert.match(ambiguous.stderr, /--output-id.*note, row/);

  const selected = run(["render", "-", form, "--output-id", "row"], input);
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /^0007\t林晓\tPending/);
  const unknown = run(["render", "-", form, "--output-id", "mistyped"], input);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown output "mistyped".*note, row/);

  const dir = mkdtempSync(join(tmpdir(), "vf-default-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const namedDefault = join(dir, "表单 with spaces.vf");
  const content = readFileSync(form, "utf8");
  writeFileSync(
    namedDefault,
    content.replace(
      '"workflow": "form",',
      '"workflow": "form", "defaultOutput": "row",',
    ),
  );
  const implicit = run(["render", "-", namedDefault], input);
  assert.equal(implicit.status, 0, implicit.stderr);
  assert.equal(implicit.stdout, selected.stdout);
  writeFileSync(
    namedDefault,
    content.replace(
      '"workflow": "form",',
      '"workflow": "form", "defaultOutput": "missing",',
    ),
  );
  assert.match(
    run(["render", "-", namedDefault], input).stderr,
    /Unknown default output "missing"/,
  );
});

test("CLI rejects malformed records and refuses to bypass verification", (t) => {
  const form = fixture("dispatch-report.vf");
  for (const [input, message] of [
    ["{\nreference:}", /near line 2/],
    ["{unknown:'0007'}", /Unknown field.*unknown/],
    ["{reference:'0007'}", /needs more values/],
  ] as const) {
    const result = run(["render", "-", form], input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, message);
  }
  const dir = mkdtempSync(join(tmpdir(), "vf-verify-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const verified = join(dir, "verified.vf");
  writeFileSync(
    verified,
    `--- veraflow 2
{ fields: { name: {type: "text", verify: true} } }
---
Hello {{name}}`,
  );
  const pending = run(["render", "-", verified], "{name:'Original'}");
  assert.equal(pending.status, 1);
  assert.match(pending.stderr, /Verification is required.*VeraFlow Desktop/);

  writeFileSync(
    verified,
    `--- veraflow 2
{ fields: { name: {type: "text", verify: true} },
  responses: { name: "Original" }, verification: { name: "form" } }
---
Hello {{name}}`,
  );
  const same = run(["render", "-", verified], "{name:'Original'}");
  assert.equal(same.status, 0, same.stderr);
  assert.equal(same.stdout, "Hello Original");
  const changed = run(["render", "-", verified], "{name:'Changed'}");
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /Verification is required/);
  const noDestination = run(["pdf", "-", verified], "{name:'Original'}");
  assert.equal(noDestination.status, 1);
  assert.match(noDestination.stderr, /--output/);
});

test("CLI discovers outputs and emits versioned render results and errors", () => {
  const form = fixture("shared-record.veraflow");
  const record = "{Reference:'0007', Contact:'林晓'}";
  const help = run(["--help", "--json"]);
  const catalog = JSON.parse(help.stdout);
  assert.equal(catalog.format, "veraflow-cli");
  assert.ok(
    catalog.commands.some((item: { name: string }) => item.name === "extract"),
  );
  const schema = JSON.parse(run(["inspect", form]).stdout);
  assert.deepEqual(
    schema.outputs.map(({ id }: { id: string }) => id),
    ["note", "row"],
  );
  assert.ok(
    schema.fields.some(
      ({ id, default: value }: { id: string; default?: string }) =>
        id === "confirmed" && value === "false",
    ),
  );

  const rendered = run(["render", "-", form, "--all"], record);
  assert.equal(rendered.status, 0, rendered.stderr);
  const result = JSON.parse(rendered.stdout);
  assert.equal(result.format, "veraflow-render");
  assert.equal(result.version, 1);
  assert.match(result.outputs[0].sections[0].text, /Hello 林晓/);
  assert.match(result.outputs[1].sections[0].text, /^0007\t林晓\tPending/);
  const valid = run(["validate", form, "--record", "-", "--all"], record);
  assert.deepEqual(JSON.parse(valid.stdout), {
    valid: true,
    outputIds: ["note", "row"],
  });

  const missing = run(
    ["render", "-", form, "--all", "--json-errors"],
    "{Reference:'0007'}",
  );
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  const error = JSON.parse(missing.stderr);
  assert.equal(error.format, "veraflow-error");
  assert.equal(error.error.code, "missingValue");
  assert.equal(error.error.outputId, "note");
  assert.deepEqual(error.error.fields, ["Contact"]);

  const ambiguous = run(["render", "-", form, "--json-errors"], record);
  assert.deepEqual(JSON.parse(ambiguous.stderr).error.outputs, ["note", "row"]);
});

test("CLI creates and prefills forms while preserving absence and verification", (t) => {
  const normalized = run(
    ["normalize", "-"],
    "{name:'林晓', id:9007199254740993, absent:null, empty:''}",
  );
  assert.deepEqual(JSON.parse(normalized.stdout), {
    name: "林晓",
    id: "9007199254740993",
    absent: null,
    empty: "",
  });
  const dir = mkdtempSync(join(tmpdir(), "vf-record-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const title = "Dispatch";
  const generated = run(["create", "-", "--title", title], "{name:'林晓'}");
  assert.equal(generated.status, 0, generated.stderr);
  const form = join(dir, "generated.vf");
  writeFileSync(form, generated.stdout);
  assert.equal(JSON.parse(run(["inspect", form]).stdout).title, title);
  assert.match(
    run(["render", "-", form], "{name:'林晓'}").stdout,
    /name: 林晓/,
  );

  writeFileSync(
    form,
    `--- veraflow 2
{fields:{ name:{type:"text",verify:true}, note:{type:"text",optional:true} },
 responses:{name:"Original",note:"Memo"}, verification:{name:"form"}}
---
Hello {{name}}`,
  );
  const merged = run(["merge", "-", form], "{note:null}");
  assert.deepEqual(JSON.parse(merged.stdout), { name: "Original", note: null });
  const draft = join(dir, "draft.vf");
  const unchanged = run(["prefill", "-", form], "{note:''}");
  assert.equal(unchanged.status, 0, unchanged.stderr);
  writeFileSync(draft, unchanged.stdout);
  assert.equal(
    run(["render", "-", draft], "{note:''}").stdout,
    "Hello Original",
  );

  const changed = run(["prefill", "-", form], "{name:'Changed'}");
  assert.equal(changed.status, 0, changed.stderr);
  writeFileSync(draft, changed.stdout);
  const blocked = run(
    ["validate", draft, "--record", "-", "--json-errors"],
    "{note:''}",
  );
  assert.equal(blocked.status, 1);
  assert.deepEqual(JSON.parse(blocked.stderr).error.fields, ["name"]);
});

test("CLI exchanges candidate evidence without changing record verification", (t) => {
  const form = fixture("shared-record.veraflow");
  const text = "Reference: 0007\nContact: 林晓\n";
  const found = run(["extract", "-", form], text);
  assert.equal(found.status, 0, found.stderr);
  const candidate = JSON.parse(found.stdout);
  assert.equal(candidate.format, "veraflow-candidates");
  assert.equal(candidate.candidates.Reference.alternatives[0].value, "0007");
  assert.equal(
    candidate.candidates.Reference.alternatives[0].evidence[0].line,
    1,
  );

  const dir = mkdtempSync(join(tmpdir(), "vf-evidence-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "source.txt");
  const record = join(dir, "record.json");
  writeFileSync(file, text);
  writeFileSync(record, '{"Reference":"0007","Contact":"Different"}');
  const normalized = run(
    ["candidates", "-", form, "--source", file],
    found.stdout,
  );
  assert.equal(normalized.status, 0, normalized.stderr);
  assert.deepEqual(JSON.parse(normalized.stdout), candidate);
  const compared = run(["compare", file, record, form]);
  const results = JSON.parse(compared.stdout).results;
  assert.equal(
    results.find(({ name }: { name: string }) => name === "Reference").status,
    "batchAssociated",
  );
  assert.equal(
    results.find(({ name }: { name: string }) => name === "Contact").status,
    "batchConflict",
  );
  writeFileSync(file, "Reference: changed");
  const rejected = run(
    ["candidates", "-", form, "--source", file, "--json-errors"],
    found.stdout,
  );
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, "");
});

test("CLI reads CSV by data row and escapes spreadsheet formulas in delimited output", (t) => {
  const csv = 'id,note\n0007,"first\nsecond"\n0008,other\n';
  assert.deepEqual(JSON.parse(run(["csv", "-"], csv).stdout), {
    headers: ["id", "note"],
    rows: 2,
  });
  assert.deepEqual(JSON.parse(run(["csv", "-", "--row", "1"], csv).stdout), {
    id: "0007",
    note: "first\nsecond",
  });
  assert.equal(
    JSON.parse(run(["csv", "-", "--row", "0", "--json-errors"], csv).stderr)
      .error.code,
    "csvRowOutOfRange",
  );

  const dir = mkdtempSync(join(tmpdir(), "vf-row-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const form = join(dir, "row.vf");
  writeFileSync(
    form,
    `--- veraflow 2
{outputs:{main:{row:{ID:"{{id}}", Note:"{{note}}"}}}}
---
{{id}} · {{note}}`,
  );
  const record = "{id:'0007', note:'=1+1'}";
  const row = run(["row", "-", form, "--format", "csv"], record);
  assert.equal(row.status, 0, row.stderr);
  assert.match(row.stdout, /^0007,'=1\+1\r?\n$/);
  assert.deepEqual(JSON.parse(run(["row", "-", form], record).stdout).cells, [
    { column: "ID", value: "0007" },
    { column: "Note", value: "=1+1" },
  ]);
});

test("CLI saves private request state exclusively, correlates stdin replies, and reports ordinary gaps", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "vf-collection-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const working = join(dir, "working.vf");
  const updated = join(dir, "updated.vf");
  const form = fixture("collection/employment.vf");
  const input =
    "{full_name:'Fictional Applicant', employer:'Fictional Employer'}";
  const parsed = (args: string[], stdin?: string) => {
    const result = run(args, stdin);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const g = parsed(["gaps", form, "--record", "-"], input);
  assert.equal(g.ready, false);
  assert.deepEqual(g.missingRequired, ["job_title"]);
  const collect = [
    "collection-request",
    form,
    "--record",
    "-",
    "--output",
    working,
    "--required-only",
  ];
  const request = parsed(collect, input);
  assert.deepEqual(
    request.questions.map(({ id }: { id: string }) => id),
    ["job_title"],
  );
  assert.doesNotMatch(JSON.stringify(request), /Fictional/);
  const privateRecord = readFileSync(working, "utf8");
  const repeat = run(collect, input);
  assert.equal(repeat.status, 1);
  assert.equal(repeat.stdout, "");
  assert.equal(readFileSync(working, "utf8"), privateRecord);
  const response = JSON.stringify(
    parsed(
      ["collection-respond", "-", fixture("collection/answers.json")],
      JSON.stringify({
        ...request,
        questions: [
          ...request.questions,
          { id: "comments", label: "Notes", type: "textarea", required: false },
        ],
      }),
    ),
  );
  const rejected = run(
    ["collection-review", "-", working, "--json-errors"],
    response,
  );
  assert.equal(JSON.parse(rejected.stderr).error.code, "collectionUnexpected");
  const requestFile = join(dir, "request.json");
  writeFileSync(requestFile, JSON.stringify(request));
  const accepted = JSON.stringify(
    parsed(
      ["collection-respond", requestFile, "-"],
      '{"job_title":"Architect"}',
    ),
  );
  const review = parsed(["collection-review", "-", working], accepted);
  assert.equal(review.format, "veraflow-collection-review");
  assert.equal(review.changes[0].kind, "new");
  assert.equal(run(["collection-apply", "-", working], accepted).status, 1);
  const applied = run(["collection-apply", "-", working, "--accept"], accepted);
  assert.equal(applied.status, 0, applied.stderr);
  writeFileSync(updated, applied.stdout);
  assert.equal(
    parsed(["collection-review", "-", updated], accepted).status,
    "duplicate",
  );
  const blocked = run(["record-export", updated, "--json-errors"]);
  assert.equal(JSON.parse(blocked.stderr).error.code, "recordNotReady");
});

test("CLI can summarize a collect-only step and honor a later output scope", () => {
  const form = fixture("housing-application.vf");
  const first = run(["gaps", form, "--step", "1"]);
  assert.equal(first.status, 0, first.stderr);
  const collected = JSON.parse(first.stdout);
  assert.deepEqual(collected.scope, { step: 0 });
  assert.deepEqual(
    new Set(collected.missingRequired),
    new Set(["legal_name", "moving_reason"]),
  );
  assert.ok(collected.inapplicable.includes("reason_en"));
  const next = run(["gaps", form, "--output-id", "application"]);
  assert.equal(next.status, 0, next.stderr);
  const output = JSON.parse(next.stdout);
  assert.deepEqual(output.scope, { outputId: "application" });
  assert.deepEqual(output.missingRequired, ["legal_name"]);
  assert.deepEqual(output.missingOptional, ["reason_en"]);
});
