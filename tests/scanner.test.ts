import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences, type Template } from "../src/core/model";
import {
  startScanner,
  addScannerField,
  scannerValue,
  applyScanner,
} from "../src/core/scanner";
import { capture, verify, eraseSession } from "../src/core/session";

test("Scanner gates individual field output and preserves captured text on mismatch", () => {
  const s = startScanner(defaultPreferences, "Scanner");
  s.fields[0].name = "name";
  capture(s, "Alex", false);
  addScannerField(s, "address");
  s.active = 0;
  assert.throws(() => scannerValue(s), /scannerUnverified/);
  s.mode = "verify";
  verify(s, "A1ex", false);
  assert.throws(() => scannerValue(s), /scannerUnverified/);
  assert.equal(s.fields[0].value, "Alex");
  verify(s, "Alex", false);
  assert.equal(scannerValue(s), "Alex"); // Other fields may still be empty.
  assert.throws(() => addScannerField(s, "name"), /scannerFieldInvalid/);
  assert.throws(() => addScannerField(s, "bad\nname"), /scannerFieldInvalid/);
});
test("template handoff matches exact names, drops mismatches, and requires fresh verification", () => {
  const s = startScanner(defaultPreferences, "Scanner");
  s.fields[0] = { name: "name", value: "Alex", status: "verified" };
  s.fields.push({
    name: "address",
    value: "wrong",
    status: "mismatch",
    candidate: "different",
  });
  const template: Template = {
    ...s.template,
    id: "template",
    content: "<name> <Name> <address>",
    fieldOrder: [],
  };
  const output = applyScanner(s, template);
  assert.deepEqual(
    output.fields.map((f) => [f.name, f.value, f.status]),
    [
      ["name", "Alex", "captured"],
      ["Name", null, "empty"],
      ["address", null, "empty"],
    ],
  );
  eraseSession(s);
  assert.equal(output.fields[0].value, "Alex");
  assert.ok(
    s.fields.every((f) => f.value === null && f.candidate === undefined),
  );
});

test("continuous Scanner capture advances only to an empty field without forcing verification", async () => {
  const { captureScanner } = await import("../src/core/scanner");
  const s = startScanner(defaultPreferences, "Scanner");
  addScannerField(s, "second");
  s.active = 0;
  captureScanner(s, "one", true);
  assert.equal(s.active, 1);
  captureScanner(s, "two", true);
  assert.equal(s.active, 1);
  assert.equal(s.mode, "capture");
  assert.deepEqual(
    s.fields.map((f) => f.value),
    ["one", "two"],
  );
});
