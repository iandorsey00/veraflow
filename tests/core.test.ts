import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFields, orderFields, renderTemplate } from "../src/core/template";
import { compare, normalize, difference } from "../src/core/compare";
import { defaultComparison as rules, type Template } from "../src/core/model";
import {
  startSession,
  capture,
  clear,
  skip,
  verify,
  beginVerification,
  renderSession,
  eraseSession,
  move,
} from "../src/core/session";
const template = (
  content = "<name> <ticket> <name>",
  verificationEnabled = true,
): Template => ({
  id: "test",
  name: "Test",
  folder: "",
  content,
  fieldOrder: [],
  verificationEnabled,
  comparison: { ...rules },
});
test("unique names preserve first appearance, Unicode and prototype-like keys", () => {
  assert.deepEqual(
    parseFields("Hello <name>. Your ticket is <ticket>. Thanks, <name>."),
    ["name", "ticket"],
  );
  assert.deepEqual(
    parseFields("<客户姓名><工单号><地址><型号><客戶><🧪><42><__proto__>"),
    ["客户姓名", "工单号", "地址", "型号", "客戶", "🧪", "42", "__proto__"],
  );
  assert.deepEqual(parseFields("<> <bad name> <bad\nname> <x\u0000>"), []);
});
test("order retains known unique names and appends new fields", () =>
  assert.deepEqual(orderFields("<b><a><c>", ["a", "gone", "a"]), [
    "a",
    "b",
    "c",
  ]));
test("literal substitution preserves formatting and never reparses inserted values", () => {
  assert.equal(
    renderTemplate(
      "Hello <name>. Ticket <ticket>.",
      new Map([
        ["name", "Ian"],
        ["ticket", "12345"],
      ]),
    ),
    "Hello Ian. Ticket 12345.",
  );
  assert.equal(
    renderTemplate("<name>\r\n<name>", new Map([["name", "$& <other>"]])),
    "$& <other>\r\n$& <other>",
  );
  assert.throws(() => renderTemplate("<x>", new Map()), /missingValue/);
});
test("comparison rules are deterministic and independently configurable", () => {
  assert.ok(compare("John Smith", " John   Smith ", rules));
  assert.ok(
    compare("123 Main St\nIrvine CA", "123 Main St\r\nIrvine CA", rules),
  );
  assert.ok(!compare("UC-P10", "UC-P1O", rules));
  assert.ok(!compare("A", "a", rules));
  assert.ok(compare("A", "a", { ...rules, caseSensitive: false }));
  assert.ok(compare("é", "e\u0301", rules));
  assert.ok(!compare("é", "e\u0301", { ...rules, unicode: false }));
  assert.ok(!compare("Ａ", "A", rules));
  assert.ok(!compare("a-b", "ab", rules));
  assert.ok(compare("a-b", "ab", { ...rules, punctuation: true }));
  assert.ok(!compare("a\nb", "a b", { ...rules, collapseLines: false }));
  assert.ok(!compare(" a", "a", { ...rules, mode: "exact" }));
  assert.ok(compare("a\r\nb", "a\nb", { ...rules, mode: "exact" }));
  assert.equal(normalize(" a\t b ", rules), "a b");
});
test("difference identifies 0 versus O and handles astral characters", () => {
  assert.deepEqual(
    difference("UC-P10", "UC-P1O").map((x) => x.middle),
    ["0", "O"],
  );
  assert.deepEqual(
    difference("🧪A", "🧪B").map((x) => x.before),
    ["🧪", "🧪"],
  );
});
test("capture advances, verification cannot overwrite, mismatch blocks completion", () => {
  const s = startSession(template());
  capture(s, "Ian");
  capture(s, "12345");
  assert.equal(s.mode, "verify");
  assert.equal(s.active, 0);
  assert.equal(verify(s, "Ian"), true);
  assert.equal(s.active, 1);
  assert.equal(verify(s, "12346"), false);
  assert.equal(s.fields[1].value, "12345");
  assert.throws(() => renderSession(s), /unverified/);
  verify(s, "12345");
  assert.equal(s.mode, "ready");
  assert.equal(renderSession(s), "Ian 12345 Ian");
  capture(s, "new", false);
  assert.equal(s.fields[1].status, "captured");
  assert.throws(() => renderSession(s), /unverified/);
});
test("skipping is explicit, empty fields block, clearing invalidates, and navigation wraps", () => {
  const s = startSession(template());
  assert.throws(() => beginVerification(s), /incomplete/);
  assert.throws(() => capture(s, "  "), /emptySelection/);
  capture(s, "Ian");
  skip(s);
  verify(s, "Ian");
  assert.equal(renderSession(s), "Ian  Ian");
  clear(s);
  assert.equal(s.fields[s.active].status, "empty");
  assert.throws(() => renderSession(s), /incomplete/);
  s.active = 0;
  move(s, -1);
  assert.equal(s.active, 1);
});
test("no verification, manual advancement, zero fields, and erasure", () => {
  const s = startSession(template("<a><b>", false));
  capture(s, "x", false);
  assert.equal(s.active, 0);
  move(s, 1);
  capture(s, "y");
  assert.equal(s.mode, "ready");
  assert.equal(renderSession(s), "xy");
  eraseSession(s);
  assert.ok(s.fields.every((f) => f.value === null && !f.candidate));
  assert.throws(() => capture(s, "z"), /sessionComplete/);
  assert.equal(renderSession(startSession(template("constant"))), "constant");
});
