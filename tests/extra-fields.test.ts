import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultComparison,
  defaultPreferences,
  type Template,
} from "../src/core/model";
import {
  startSession,
  capture,
  verify,
  renderSession,
  renderEmail,
  beginVerification,
} from "../src/core/session";
import {
  captureFieldNames,
  rememberedFieldOrder,
  validateExtraFields,
} from "../src/core/template";
import {
  completedFieldsToScanner,
  applyScanner,
  startScanner,
} from "../src/core/scanner";
import {
  exportTemplateArchive,
  parseTemplateArchive,
} from "../src/core/transfer";
const template = (): Template => ({
  id: "test",
  name: "Template",
  folder: "",
  content: "Hello {{name}}",
  placeholderStyle: "braces",
  extraFields: ["booking reference", "name"],
  fieldOrder: ["booking reference", "name"],
  comparison: { ...defaultComparison },
  verificationEnabled: true,
});
test("extra fields participate once in capture and verification but never appear in rendered text", () => {
  const t = template(),
    s = startSession(t);
  assert.deepEqual(
    s.fields.map((f) => f.name),
    ["booking reference", "name"],
  );
  capture(s, "AB-104");
  capture(s, "Alex");
  assert.throws(() => renderSession(s), /unverified/);
  verify(s, "AB-1O4");
  assert.throws(() => renderSession(s), /unverified/);
  verify(s, "AB-104");
  verify(s, "Alex");
  assert.equal(renderSession(s), "Hello Alex");
  const scanner = completedFieldsToScanner(
    s,
    defaultPreferences,
    "Scanner",
    "Field 1",
  );
  assert.deepEqual(scanner.fields, s.fields);
  assert.equal(scanner.template.extraFields, undefined);
  scanner.fields[0].value = "changed";
  assert.equal(s.fields[0].value, "AB-104");
});
test("email renders actual sections only and extras survive disabled headers and mode toggles", () => {
  const t = template();
  t.email = {
    enabled: true,
    subject: "Update",
    to: "{{email}}",
    cc: "{{optional cc}}",
    bcc: "",
    ccEnabled: false,
    bccEnabled: false,
  };
  t.extraFields = ["booking reference"];
  t.fieldOrder = rememberedFieldOrder(t);
  assert.deepEqual(captureFieldNames(t), [
    "booking reference",
    "name",
    "email",
  ]);
  const s = startSession(t);
  for (const f of s.fields) {
    f.value =
      f.name === "name"
        ? "Alex"
        : f.name === "email"
          ? "alex@example.test"
          : "AB-104";
    f.status = "verified";
  }
  assert.deepEqual(
    renderEmail(s).map((p) => p.text),
    ["Update", "alex@example.test", "Hello Alex"],
  );
  t.email.enabled = false;
  assert.deepEqual(captureFieldNames(t), ["booking reference", "name"]);
});
test("Scanner handoff includes extras but resets verification under the template policy", () => {
  const scanner = startScanner(
    defaultPreferences,
    "Scanner",
    "booking reference",
  );
  scanner.fields[0] = {
    name: "booking reference",
    value: "AB-104",
    status: "verified",
  };
  const s = applyScanner(scanner, template());
  assert.equal(s.fields[0].value, "AB-104");
  assert.equal(s.fields[0].status, "captured");
  assert.equal(s.fields[1].status, "empty");
});
test("template JSON round-trips only definitions and rejects malformed extra fields", () => {
  const t = template(),
    json = exportTemplateArchive([t]);
  assert.deepEqual(parseTemplateArchive(json)[0], t);
  for (const value of [
    ["duplicate", "duplicate"],
    ["{{bad}}"],
    ["bad\nname"],
    ["bad\u0000name"],
    ["   "],
    [{ name: "field", value: "secret" }],
    Array(1001).fill("x"),
  ]) {
    assert.throws(() => validateExtraFields(value));
    const x = JSON.parse(json);
    x.templates[0].extraFields = value;
    assert.throws(
      () => parseTemplateArchive(JSON.stringify(x)),
      /invalidImport/,
    );
  }
  delete t.extraFields;
  assert.deepEqual(
    startSession(t).fields.map((f) => f.name),
    ["name"],
  );
});
