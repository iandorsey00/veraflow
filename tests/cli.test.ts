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
