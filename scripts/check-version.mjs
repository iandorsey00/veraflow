import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const version = JSON.parse(read("package.json")).version;
assert.equal(JSON.parse(read("package-lock.json")).version, version);
assert.equal(
  JSON.parse(read("package-lock.json")).packages[""].version,
  version,
);
assert.equal(JSON.parse(read("src-tauri/tauri.conf.json")).version, version);
assert.equal(
  read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1],
  version,
);
assert.equal(
  read("src-tauri/Cargo.lock").match(
    /name = "veraflow"\nversion = "([^"]+)"/,
  )?.[1],
  version,
);
console.log(`Release metadata agrees: ${version}`);
