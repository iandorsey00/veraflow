import assert from "node:assert/strict";
import { test } from "node:test";
import { compareSourceText } from "../src/core/batch";
import { filenamePatternError, suggestedFilename } from "../src/core/filenames";
import { defaultComparison, defaultPreferences } from "../src/core/model";
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
