import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultComparison,
  defaultEmail,
  type Template,
} from "../src/core/model";
import {
  startSession,
  capture,
  verify,
  renderEmail,
  deliverEmailSection,
  moveEmailSection,
} from "../src/core/session";
import { templateSource } from "../src/core/template";
const template = (): Template => ({
  id: "email",
  name: "Email",
  folder: "",
  content: "Hello <name>",
  fieldOrder: [],
  verificationEnabled: true,
  comparison: { ...defaultComparison },
  email: {
    ...defaultEmail,
    enabled: true,
    subject: "Update for <name>",
    to: "<address>",
    cc: "<hidden_cc>",
    bcc: "<hidden_bcc>",
  },
});
test("email sections share placeholders, omit disabled recipients and require verification", () => {
  const s = startSession(template());
  assert.deepEqual(
    s.fields.map((f) => f.name),
    ["name", "address"],
  );
  capture(s, "Alex");
  capture(s, "alex@example.test");
  assert.throws(() => renderEmail(s), /unverified/);
  verify(s, "Alex");
  verify(s, "alex@example.test");
  assert.deepEqual(
    renderEmail(s).map((p) => p.text),
    ["Update for Alex", "alex@example.test", "Hello Alex"],
  );
  s.template.email!.enabled = false;
  assert.equal(templateSource(s.template), "Hello <name>");
});
test("enabled Cc/Bcc preserve order and reject header control characters", () => {
  const t = template();
  t.email!.ccEnabled = t.email!.bccEnabled = true;
  t.verificationEnabled = false;
  const s = startSession(t);
  for (const value of [
    "Alex",
    "alex@example.test",
    "cc@example.test",
    "bcc@example.test",
  ])
    capture(s, value);
  assert.deepEqual(
    renderEmail(s).map((p) => p.key),
    ["subject", "to", "cc", "bcc", "body"],
  );
  s.fields[1].value = "alex@example.test\nBcc: unexpected@example.test";
  assert.throws(() => renderEmail(s), /emailHeaderInvalid/);
  s.fields[1].value = "";
  assert.throws(() => renderEmail(s), /emailRequired/);
});
test("output advances only on success, supports back, and never tabs after Body", async () => {
  const t = template();
  t.content = "Body";
  t.email!.subject = "Subject";
  t.email!.to = "alex@example.test";
  const s = startSession(t);
  s.mode = "delivery";
  const sent: [string | null, boolean][] = [];
  const send = async (text: string | null, tab: boolean) => {
    sent.push([text, tab]);
  };
  await deliverEmailSection(s, true, send);
  assert.equal(sent.length, 0);
  await assert.rejects(
    deliverEmailSection(s, false, async () => {
      throw Error("blocked");
    }),
  );
  assert.equal(s.deliveryIndex, undefined);
  await deliverEmailSection(s, false, send);
  assert.equal(s.deliveryIndex, 1);
  await deliverEmailSection(s, true, send);
  assert.equal(s.deliveryIndex, 0);
  await deliverEmailSection(s, false, send);
  await deliverEmailSection(s, false, send);
  await deliverEmailSection(s, false, send);
  assert.equal(s.deliveryDone, true);
  assert.deepEqual(sent.at(-1), ["Body", false]);
  const count = sent.length;
  await deliverEmailSection(s, false, send);
  assert.equal(sent.length, count);
  await deliverEmailSection(s, true, send);
  assert.equal(s.deliveryDone, false);
  assert.equal(s.deliveryIndex, 1);
});

test("manual recovery moves sections after failed injection without sending any keys", async () => {
  const t = template();
  t.content = "Body";
  t.email!.subject = "Subject";
  t.email!.to = "alex@example.test";
  const s = startSession(t);
  s.mode = "delivery";
  await assert.rejects(
    deliverEmailSection(s, false, async () => {
      throw Error("emailPasteFailed");
    }),
  );
  moveEmailSection(s, 1);
  assert.equal(s.deliveryIndex, 1);
  moveEmailSection(s, -1);
  assert.equal(s.deliveryIndex, 0);
  moveEmailSection(s, 1);
  moveEmailSection(s, 1);
  moveEmailSection(s, 1);
  assert.equal(s.deliveryDone, true);
  moveEmailSection(s, -1);
  assert.equal(s.deliveryDone, false);
  assert.equal(s.deliveryIndex, 2);
});

test("custom paste order excludes Subject values and requires only included headers", async () => {
  const t = template();
  t.content = "Body";
  t.email!.subject = "<omitted>";
  t.email!.subjectEnabled = false;
  t.email!.to = "alex@example.test";
  t.email!.ccEnabled = true;
  t.email!.cc = "team@example.test";
  t.email!.order = ["to", "cc", "bcc", "subject"];
  const s = startSession(t);
  assert.deepEqual(s.fields, []);
  assert.deepEqual(
    renderEmail(s).map((p) => p.key),
    ["to", "cc", "body"],
  );
  s.mode = "delivery";
  const sent: [string | null, boolean][] = [];
  const send = async (text: string | null, tab: boolean) => {
    sent.push([text, tab]);
  };
  await deliverEmailSection(s, false, send);
  await deliverEmailSection(s, false, send);
  await deliverEmailSection(s, false, send);
  assert.deepEqual(sent, [
    ["alex@example.test", true],
    ["team@example.test", true],
    ["Body", false],
  ]);
  t.email!.subjectEnabled = true;
  t.email!.subject = "Subject";
  assert.deepEqual(
    renderEmail(startSession(t)).map((p) => p.key),
    ["to", "cc", "subject", "body"],
  );
});
