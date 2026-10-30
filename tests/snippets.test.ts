import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkspace,
  veraId,
  validateWorkspace,
  exportWorkspace,
  importWorkspace,
  exportSnippets,
  importSnippets,
  type Workspace,
} from "../src/core/workspace";
const fixture = (): Workspace => {
  const table = {
    id: veraId(),
    name: "Trips",
    folderId: "",
    fields: [],
    rowTitles: false,
    output: "",
    externalIds: [],
    rows: [],
  };
  return {
    folders: [],
    tables: [table],
    snippets: [
      {
        id: veraId(),
        tableId: table.id,
        title: "Confirmation",
        content: "Hello {{literal}}\n<address@example.test>",
      },
      {
        id: veraId(),
        tableId: "",
        title: "Unfiled note",
        content: "Thank you.",
      },
    ],
  };
};
test("table and unfiled snippets round trip through database with ID remapping and parent links", () => {
  const w = fixture();
  assert.deepEqual(importWorkspace(exportWorkspace(w), emptyWorkspace()), w);
  const merged = importWorkspace(exportWorkspace(w), w);
  assert.equal(merged.snippets!.length, 4);
  assert.equal(merged.snippets![2].tableId, merged.tables[1].id);
  assert.notEqual(merged.snippets![2].id, w.snippets![0].id);
  assert.equal(merged.snippets![3].tableId, "");
  assert.deepEqual(merged.snippets!.slice(0, 2), w.snippets);
});
test("snippet exchange includes only titles and literal text, assigns destination and fresh IDs", () => {
  const w = fixture();
  const json = exportSnippets(w.snippets!);
  const archive = JSON.parse(json);
  assert.deepEqual(Object.keys(archive.snippets[0]).sort(), [
    "content",
    "title",
  ]);
  const copies = importSnippets(json, w.tables[0].id);
  assert.equal(copies[0].content, w.snippets![0].content);
  assert.equal(copies[0].tableId, w.tables[0].id);
  assert.notEqual(copies[0].id, w.snippets![0].id);
  assert.equal(importSnippets(json)[0].tableId, "");
});
test("snippet validation rejects dangling/colliding IDs, empty/unsafe titles, oversized/NUL content and unknown metadata", () => {
  for (const mutate of [
    (w: any) => (w.snippets[0].tableId = veraId()),
    (w: any) => (w.snippets[0].id = w.tables[0].id),
    (w: any) => (w.snippets[0].title = ""),
    (w: any) => (w.snippets[0].title = "a\nb"),
    (w: any) => (w.snippets[0].content = " "),
    (w: any) => (w.snippets[0].content = "\0"),
    (w: any) => (w.snippets[0].content = "界".repeat(350000)),
    (w: any) => (w.snippets[0].verified = true),
    (w: any) => (w.snippets = null),
  ]) {
    const w = fixture();
    mutate(w);
    assert.throws(() => validateWorkspace(w), /invalidImport/);
  }
  const archive = JSON.parse(exportSnippets(fixture().snippets!));
  archive.snippets[0].tableId = veraId();
  assert.throws(() => importSnippets(JSON.stringify(archive)), /invalidImport/);
  assert.throws(
    () =>
      importSnippets(
        JSON.stringify({
          format: "veraflow-snippets",
          version: 2,
          snippets: [],
        }),
      ),
    /invalidImport/,
  );
});
