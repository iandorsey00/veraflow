import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (name) => JSON.parse(readFileSync(name, "utf8"));
const stable = read("src-tauri/tauri.conf.json");
const test = read("src-tauri/tauri.test.conf.json");
assert.equal(test.identifier, "com.veraflow.test");
assert.notEqual(test.identifier, stable.identifier);
assert.notEqual(test.productName, stable.productName);
assert.equal(test.bundle.createUpdaterArtifacts, false);
assert.deepEqual(
  test.app.windows.map((w) => w.label),
  ["main"],
);
assert.equal(test.app.windows[0].minWidth, stable.app.windows[0].minWidth);
assert.equal(test.app.windows[0].minHeight, stable.app.windows[0].minHeight);
console.log(
  "Windows test configuration has a separate identity and no update artifacts.",
);
