import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences } from "../src/core/model";
import { startScanner } from "../src/core/scanner";
import { beginReverification, verify } from "../src/core/session";
test("selected reverification preserves original values and unrelated verification", () => {
  const s = startScanner(defaultPreferences, "Scanner");
  s.fields = [
    { name: "a", value: "A", status: "verified" },
    { name: "b", value: "B", status: "verified" },
  ];
  beginReverification(s);
  assert.equal(s.fields[0].status, "captured");
  assert.equal(s.fields[1].status, "verified");
  assert.equal(verify(s, "wrong", false), false);
  assert.equal(s.fields[0].value, "A");
  assert.equal(verify(s, "A", false), true);
  assert.equal(s.mode, "ready");
  beginReverification(s, true);
  assert.deepEqual(
    s.fields.map((f) => f.status),
    ["captured", "captured"],
  );
  assert.equal(s.fields[0].candidate, undefined);
  verify(s, "A");
  assert.equal(s.active, 1);
  verify(s, "B");
  assert.equal(s.mode, "ready");
});
test("all-filled reverification ignores empty fields and never advances to a negative index", () => {
  const s = startScanner(defaultPreferences, "Scanner");
  assert.throws(() => beginReverification(s, true), /noValue/);
  assert.equal(s.mode, "capture");
  s.fields.push({ name: "b", value: "B", status: "verified" });
  beginReverification(s, true);
  assert.equal(s.active, 1);
  verify(s, "B");
  assert.equal(s.active, 1);
  assert.equal(s.mode, "capture");
  s.mode = "review";
  assert.throws(() => beginReverification(s, true), /sessionComplete/);
  assert.equal(s.fields[1].status, "verified");
});
