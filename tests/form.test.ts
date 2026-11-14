import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultComparison, type Template } from "../src/core/model";
import {
  capture,
  prepareWorkflow,
  renderEmail,
  renderSession,
  startSession,
  verify,
} from "../src/core/session";
import { validControlValue } from "../src/core/form";

const definition: Template = {
  id: "form",
  name: "Form",
  folder: "",
  fieldOrder: [],
  placeholderStyle: "braces",
  verificationEnabled: true,
  comparison: defaultComparison,
  content: "",
};

test("typed controls, defaults and optional conditional fields render literal output", () => {
  const content = String.raw`{{dropdown delivery: email="Email" | post="Post"}}
{{text address: when delivery=post}}{{text note?:}}
{{number count: "3"}} {{date due: "2026-12-01"}}
{{checkbox tracking: yes="Tracked" | no=""}}{{switch updates: yes="Updates" | no=""}}
{{choice delivery: email="Sent\nby email" | post="Sent by post"}}`;
  const s = startSession({ ...definition, content });
  prepareWorkflow(s, true);
  const initial = renderSession(s);
  assert.match(initial, /Email\n\n3 2026-12-01/);
  assert.match(initial, /Sent\nby email/);
  s.active = s.fields.findIndex((f) => f.name === "delivery");
  capture(s, "post", false);
  assert.throws(() => renderSession(s), /incomplete/);
  s.active = s.fields.findIndex((f) => f.name === "address");
  capture(s, "12 {{literal}} Road", false);
  assert.match(renderSession(s), /12 {{literal}} Road/);
  assert.equal(validControlValue({ kind: "date" }, "2026-02-29"), false);
  assert.equal(validControlValue({ kind: "number" }, "0x12"), false);
  assert.equal(
    validControlValue({ kind: "email" }, "person@example.test"),
    true,
  );
});

test("repeat-entry verification cannot stand in for a Scanner source check", () => {
  const s = startSession({
    ...definition,
    typingVerification: true,
    content: "{{text name:}}",
  });
  prepareWorkflow(s, true);
  capture(s, "Alex");
  assert.equal(verify(s, "Alex"), true);
  assert.equal(renderSession(s), "Alex");
  prepareWorkflow(s, false);
  assert.throws(() => renderSession(s), /unverified/);
  assert.equal(verify(s, "Alex"), true);
  assert.equal(renderSession(s), "Alex");
});

test("rejects malformed selections and validates conditional email header output", () => {
  assert.throws(
    () =>
      startSession({
        ...definition,
        content: '{{select team: a="A" | a="B"}}',
      }),
    /invalidFormDirective/,
  );
  assert.throws(
    () => startSession({ ...definition, content: '{{choice missing: a="A"}}' }),
    /invalidFormDirective/,
  );
  assert.throws(
    () =>
      startSession({
        ...definition,
        content: String.raw`{{text field: "\x"}}`,
      }),
    /invalidFormDirective/,
  );
  const s = startSession({
    ...definition,
    verificationEnabled: false,
    content: 'Hi {{choice person: a="Alex" | b="Bo"}}',
    email: {
      enabled: true,
      subject: "Update",
      to: String.raw`{{radio person: a="Alex <alex@example.test>" | b="bo@example.test\nCc: extra@example.test"}}`,
      cc: "",
      bcc: "",
      ccEnabled: false,
      bccEnabled: false,
    },
  });
  assert.equal(
    renderEmail(s).find((p) => p.key === "to")?.text,
    "Alex <alex@example.test>",
  );
  capture(s, "b");
  assert.throws(() => renderEmail(s), /emailHeaderInvalid/);
});
