import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultComparison,
  defaultEmail,
  type Template,
} from "../src/core/model";
import { parseFields, renderTemplate } from "../src/core/template";
import {
  exportTemplateArchive,
  parseTemplateArchive,
} from "../src/core/transfer";
const template: Template = {
  id: "old",
  name: "客户",
  folder: "Examples",
  content: "Hi {{name}}",
  placeholderStyle: "braces",
  fieldOrder: ["name"],
  verificationEnabled: true,
  comparison: { ...defaultComparison },
  email: {
    ...defaultEmail,
    enabled: true,
    subject: "Hello {{name}}",
    to: "Joe Smith <joe.smith@example.com>",
  },
};
test("braces preserve email addresses and escapes keep literal delimiters", () => {
  const content = String.raw`{{name}} Joe Smith <joe.smith@example.com> \{{literal}} \\ C:\folder`;
  assert.deepEqual(parseFields(content, "braces"), ["name"]);
  assert.equal(
    renderTemplate(content, new Map([["name", "{{raw}}"]]), "braces"),
    String.raw`{{raw}} Joe Smith <joe.smith@example.com> {{literal}} \ C:\folder`,
  );
  assert.deepEqual(parseFields(String.raw`<name> \<joe.smith@example.com>`), [
    "name",
  ]);
  assert.equal(
    renderTemplate(
      String.raw`<name> \<joe.smith@example.com>`,
      new Map([["name", "Joe Smith"]]),
    ),
    "Joe Smith <joe.smith@example.com>",
  );
});
test("template archive round trips Unicode, email, comparison, and syntax", () => {
  assert.deepEqual(parseTemplateArchive(exportTemplateArchive([template])), [
    template,
  ]);
});
test("imports reject session data, settings, unknown versions, malformed data and excessive sizes", () => {
  const base = JSON.parse(exportTemplateArchive([template]));
  for (const mutate of [
    (v: any) => {
      v.preferences = {};
    },
    (v: any) => {
      v.version = 2;
    },
    (v: any) => {
      v.templates[0].fields = [{ value: "private" }];
    },
    (v: any) => {
      v.templates[0].email.deliveryIndex = 1;
    },
    (v: any) => {
      v.templates[0].placeholderStyle = "custom";
    },
    (v: any) => {
      v.templates[0].verificationEnabled = "true";
    },
    (v: any) => {
      v.templates[0].content = "x".repeat(1024 * 1024 + 1);
    },
  ]) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(
      () => parseTemplateArchive(JSON.stringify(value)),
      /invalidImport/,
    );
  }
  assert.throws(() => parseTemplateArchive("{}"), /invalidImport/);
  assert.throws(() => parseTemplateArchive("not json"), /invalidImport/);
});

test("email order and Subject inclusion round trip and malformed orders are rejected", () => {
  const t = structuredClone(template);
  t.email!.subjectEnabled = false;
  t.email!.order = ["to", "cc", "bcc", "subject"];
  assert.deepEqual(parseTemplateArchive(exportTemplateArchive([t])), [t]);
  for (const order of [
    ["to", "cc", "bcc", "to"],
    ["to", "body", "cc", "subject"],
    ["to"],
    "to",
  ]) {
    const json = JSON.parse(exportTemplateArchive([t]));
    json.templates[0].email.order = order;
    assert.throws(
      () => parseTemplateArchive(JSON.stringify(json)),
      /invalidImport/,
    );
  }
});
