import { readFileSync } from "node:fs";
import {
  candidateFields,
  candidateFile,
  extractCandidates,
  importCandidateFile,
} from "../src/core/candidates";
import { startSession } from "../src/core/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareSourceText } from "../src/core/batch";
import { filenamePatternError, suggestedFilename } from "../src/core/filenames";
import {
  defaultComparison,
  defaultPreferences,
  type Template,
} from "../src/core/model";
import { shortcutAccelerator, shortcutLabel } from "../src/core/shortcuts";

test("batch comparison distinguishes label evidence, ambiguity, weak matches and conflicts", () => {
  const fields = [
    ["serial", "Serial number", "D-42"],
    ["customer", "Customer", "Jane"],
    ["street", "Street", "Example Way"],
    ["reference", "Reference", "A-1"],
    ["model", "Model", "MX-100"],
  ].map(([name, label, value]) => ({ name, label, value }));
  assert.deepEqual(
    compareSourceText(
      fields,
      "Serial number: D-42\nCustomer: Jane\nCustomer: Alex\nExample Way\nReference: A-2",
      defaultComparison,
    ).map((entry) => entry.status),
    [
      "batchAssociated",
      "batchAmbiguous",
      "batchFound",
      "batchConflict",
      "batchMissing",
    ],
  );
});

test("filenames validate tokens, omit missing values and sanitize path characters", () => {
  const pattern = "{{output_name}}-{{field.Reference}}-{{timestamp}}";
  assert.equal(
    filenamePatternError(pattern, new Set(["Reference"])),
    undefined,
  );
  assert.match(
    filenamePatternError(pattern, new Set()) ?? "",
    /Unknown filename placeholder/,
  );
  assert.equal(
    suggestedFilename(
      pattern,
      new Map([
        ["output_name", "../通知"],
        ["field.Reference", "A/B"],
      ]),
      "txt",
    ),
    "通知-A-B.txt",
  );
  assert.equal(suggestedFilename("CON", new Map(), "json"), "_CON.json");
});

test("the default output binding uses platform names and readable aliases can be edited", () => {
  const binding = defaultPreferences.shortcuts.finish;
  assert.equal(shortcutLabel(binding, true), "Cmd+Opt+X");
  assert.equal(shortcutLabel(binding, false), "Ctrl+Alt+X");
  assert.equal(shortcutAccelerator("Cmd+Opt+X"), "Super+Alt+X");
});

const workflowTemplate = (content: string): Template => ({
  id: "fixture",
  name: "Fixture",
  folder: "",
  placeholderStyle: "source",
  content,
  fieldOrder: [],
  verificationEnabled: false,
  comparison: defaultComparison,
});

test("candidate extraction labels, exact option identities, ambiguity, invalid and missing fields", () => {
  const s = startSession(
    workflowTemplate(`--- veraflow 2
{fields:{
  model:{type:'text', label:'Display model', aliases:['型号']},
  serial:{type:'text', aliases:['Serial number']},
  other_serial:{type:'text', aliases:['Serial number']},
  quantity:{type:'number', aliases:['Units']},
  route:{type:'dropdown', options:[{id:'air',label:'Air freight',output:'AIR'}]},
  address:{type:'text'}
}}
---
{{model}}`),
  );
  const fields = candidateFields(s);
  const result = extractCandidates(
    fields,
    "型号：V6530\r\nmodel: V6530\nSerial number\tABC123456\nUnits: three\nroute: Air freight",
  );
  assert.deepEqual(
    Object.fromEntries([...result].map(([key, value]) => [key, value.status])),
    {
      model: "found",
      serial: "ambiguous",
      other_serial: "ambiguous",
      quantity: "invalid",
      route: "found",
      address: "not_found",
    },
  );
  assert.equal(
    result.get("model")?.alternatives[0].evidence[0].quote,
    "型号：V6530",
  );
  assert.equal(result.get("model")?.alternatives[0].evidence.length, 2);
  assert.equal(result.get("route")?.alternatives[0].value, "air");
  assert.equal(
    importCandidateFile(fields, JSON.stringify(candidateFile(result))).get(
      "quantity",
    )?.status,
    "invalid",
  );
  assert.throws(
    () => extractCandidates(fields, "a".repeat(65537)),
    /batchSourceLimit/,
  );
});

test("candidate import checks strict shape, unknown fields, evidence and option IDs", () => {
  const fixture = (name: string) =>
    readFileSync(
      new URL(`../examples/source/${name}`, import.meta.url),
      "utf8",
    );
  const s = startSession(workflowTemplate(fixture("service-intake.vf")));
  const fields = candidateFields(s);
  const text = fixture("service-email-candidates.json");
  const result = importCandidateFile(
    fields,
    text,
    fixture("service-intake-email.txt"),
  );
  assert.equal(result.get("quantity_affected")?.alternatives[0].value, "1");
  assert.equal(result.get("shipping_address")?.status, "not_found");
  assert.equal(
    importCandidateFile(
      fields,
      fixture("service-call-candidates.json"),
      fixture("service-intake-call.txt"),
    ).get("serial_number")?.alternatives[0].value,
    "ABC123458",
  );
  assert.throws(
    () => importCandidateFile(fields, text, "a different source"),
    /candidateEvidenceMismatch/,
  );
  assert.throws(
    () =>
      importCandidateFile(
        fields,
        text.replace('"version": 1', '"version": 1, "version": 1'),
      ),
    /invalidCandidateFile/,
  );
  assert.throws(
    () =>
      importCandidateFile(fields, text.replace('"version": 1', '"version": 2')),
    /invalidCandidateFile/,
  );
  assert.throws(
    () => importCandidateFile(fields, text.replace('"model":', '"unknown":')),
    /recordUnknownField:unknown/,
  );
  assert.throws(
    () =>
      importCandidateFile(
        fields,
        text.replace('"value": "1"', '"value": "three"'),
      ),
    /recordInvalidField:quantity_affected/,
  );
});
