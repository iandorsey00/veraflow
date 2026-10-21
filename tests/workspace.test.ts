import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkspace,
  fieldNames,
  veraId,
  validateWorkspace,
  importWorkspace,
  exportWorkspace,
  importScanner,
  exportScanner,
  rowFromScanner,
  scannerTemplateParts,
  type Workspace,
} from "../src/core/workspace";
import { startScanner } from "../src/core/scanner";
import { defaultPreferences } from "../src/core/model";
function fixture(): Workspace {
  const folder = { id: veraId(), name: "Trips" };
  return {
    folders: [folder],
    tables: [
      {
        id: veraId(),
        name: "Bookings",
        folderId: folder.id,
        fields: ["reference", "address"],
        rowTitles: true,
        output: "Booking {{reference}}",
        externalIds: [{ label: "Source", value: "External 104" }],
        rows: [
          {
            id: veraId(),
            title: "Trip 104",
            externalIds: [{ label: "Booking", value: "AB-104" }],
            values: { reference: "AB-104", address: "One\nTwo" },
          },
        ],
      },
    ],
  };
}
test("workspace round-trip retains stable IDs, references, multiline values and optional row titles", () => {
  const w = fixture();
  w.tables[0].rowTitles = false;
  assert.deepEqual(importWorkspace(exportWorkspace(w), emptyWorkspace()), w);
});
test("importing existing IDs creates independent copies without overwriting originals", () => {
  const w = fixture(),
    result = importWorkspace(exportWorkspace(w), w);
  assert.equal(result.tables.length, 2);
  assert.deepEqual(result.tables[0], w.tables[0]);
  assert.notEqual(result.tables[1].id, w.tables[0].id);
  assert.notEqual(result.tables[1].rows[0].id, w.tables[0].rows[0].id);
  assert.equal(result.tables[1].folderId, result.folders[1].id);
});
test("reject unknown properties, invalid IDs, dangling folders and unknown cell fields", () => {
  for (const mutate of [
    (w: any) => (w.clipboard = "secret"),
    (w: any) => (w.tables[0].id = "bad"),
    (w: any) => (w.tables[0].folderId = veraId()),
    (w: any) => (w.tables[0].rows[0].values.extra = "value"),
    (w: any) => (w.tables[0].rows[0].verified = true),
  ]) {
    const w = fixture();
    mutate(w);
    assert.throws(() => validateWorkspace(w));
  }
});
test("strict names accept multiline list but reject duplicates, brackets, controls and empty lists", () => {
  assert.deepEqual(fieldNames("name\n\naddress\r\nbooking reference"), [
    "name",
    "address",
    "booking reference",
  ]);
  for (const input of ["", "name\nname", "a\tb", "{{name}}"])
    assert.throws(() => fieldNames(input));
});
test("Scanner JSON fields-only excludes values; value imports lose all verification and candidate metadata", () => {
  const s = startScanner(defaultPreferences, "Scanner", "reference");
  s.fields[0] = {
    name: "reference",
    value: "AB-104",
    status: "verified",
    candidate: "AB-104",
  };
  const structure = JSON.parse(exportScanner(s, false));
  assert.deepEqual(structure.fields, [{ name: "reference" }]);
  const imported = importScanner(exportScanner(s, true));
  assert.deepEqual(imported.fields, [{ name: "reference", value: "AB-104" }]);
  assert.equal(JSON.stringify(imported).includes("verified"), false);
  structure.fields[0].status = "verified";
  assert.throws(() => importScanner(JSON.stringify(structure)));
});
test("mismatches cannot overwrite saved row values and are excluded from Scanner JSON", () => {
  const s = startScanner(defaultPreferences, "Scanner", "reference");
  s.fields[0] = {
    name: "reference",
    value: "AB-104",
    status: "mismatch",
    candidate: "AB-1O4",
  };
  assert.throws(() => rowFromScanner(s));
  assert.equal(importScanner(exportScanner(s, true)).fields[0].value, null);
});
test("Scanner template parses spaces and escaped braces without interpreting imported HTML", () => {
  assert.deepEqual(
    scannerTemplateParts("Hello {{full name}} / \\{{literal}} <script>"),
    [
      { text: "Hello " },
      { text: "{{full name}}", name: "full name" },
      { text: " / " },
      { text: "{{" },
      { text: "literal}} <script>" },
    ],
  );
});
test("fieldless table and rowless database export remain valid", () => {
  const w = fixture();
  w.tables[0].fields = [];
  w.tables[0].rows = [];
  w.tables[0].output = "Reusable text";
  assert.deepEqual(importWorkspace(exportWorkspace(w), emptyWorkspace()), w);
});
