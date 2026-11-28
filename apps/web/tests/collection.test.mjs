import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { embeddedTemplate, script } from "./fixtures.mjs";

const {
  outputFiles: [runtime],
} = await build({
  entryPoints: ["src/questionnaire.ts"],
  bundle: true,
  format: "iife",
  target: ["safari15.4", "chrome100"],
  write: false,
  nodePaths: [resolve("node_modules")],
});
const hash = (value) => createHash("sha256").update(value).digest("base64");
const style = await readFile("src/style.css", "utf8");
const {
  outputFiles: [module],
} = await build({
  stdin: {
    contents:
      'export * from "./src/collection"; export * from "./src/collection-export";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  nodePaths: [resolve("node_modules")],
  define: {
    COLLECTION_RUNTIME: JSON.stringify(runtime.text),
    COLLECTION_SCRIPT_HASH: JSON.stringify(hash(runtime.text)),
    FORM_STYLE: JSON.stringify(style),
    STYLE_HASH: JSON.stringify(hash(style)),
  },
});
const {
  readCollectionRequest,
  collectionResponseWriter,
  exportCollectionHtml,
} = await import(
  `data:text/javascript;base64,${Buffer.from(module.contents).toString("base64")}`
);

const specimen = {
  format: "veraflow-collection-request",
  version: 1,
  requestId: "00000000-example-request",
  questions: [
    {
      id: "ready",
      label: "已准备",
      type: "boolean",
      required: true,
      options: [
        { id: "true", label: "是" },
        { id: "false", label: "否" },
      ],
    },
    {
      id: "method",
      label: "选项",
      type: "dropdown",
      required: true,
      options: [
        { id: "m1", label: "线上" },
        { id: "m2", label: "线下" },
      ],
    },
    {
      id: "comments",
      label: "</script><b>补充</b>",
      instructions: "<em>请说明</em>",
      type: "textarea",
      required: false,
      multiline: true,
      allowBlankLines: false,
    },
    { id: "__proto__", label: "参考编号", type: "text", required: false },
  ],
};
const requestText = JSON.stringify(specimen);

async function scratch(t) {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-collection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("collection validates strict minimal JSON and rejects tampered requests", () => {
  assert.deepEqual(readCollectionRequest("\uFEFF" + requestText), specimen);
  for (const bad of [
    requestText.replace('"version":1', '"version":1,"version":1'),
    requestText.replace('"id":"true"', '"id":"true","id":"false"'),
    requestText.replace('"id":"m2"', '"id":"m1"'),
    requestText.replace('"id":"method"', '"id":"ready"'),
    requestText.replace('"id":"false"', '"id":"no"'),
    requestText.replace('"version":1', '"version":2'),
    requestText.replace(
      '"required":true',
      '"required":true,"knownValue":"secret"',
    ),
    requestText.replace('"questions":', '"recordState":{},"questions":'),
    requestText.slice(0, -1) + ",}",
    "x".repeat(1024 * 1024 + 1),
  ])
    assert.throws(() => readCollectionRequest(bad));
});

test("questionnaire includes only literal public questions, inline assets and matching CSP", () => {
  const html = exportCollectionHtml(
    readCollectionRequest(requestText),
    "zh-CN",
  );
  assert.match(html, /<html lang="zh-CN">/);
  const [embedded] = html.match(
    /<script type="application\/json" id="collection-request">[^]*?<\/script>/,
  );
  assert.ok(!embedded.includes("<b>"));
  const value = embedded.slice(embedded.indexOf(">") + 1, -"</script>".length);
  assert.deepEqual(JSON.parse(value), specimen);
  assert.ok(!/\s(?:src|href)="https?:/u.test(html));
  assert.doesNotMatch(html, /id="(?:definition|provenance)"/);
  assert.match(html, /default-src 'none'/);
  assert.ok(html.includes(`script-src 'sha256-${hash(runtime.text)}'`));
  assert.ok(html.includes(`style-src 'sha256-${hash(style)}'`));
  assert.ok(html.includes("<script>" + runtime.text + "</script>"));
});

test("response keeps choice IDs, strips blank lines and reuses the ID on download retry", () => {
  const write = collectionResponseWriter(readCollectionRequest(requestText));
  assert.throws(() => write(new Map()), /collectionRequired/);
  assert.throws(
    () => write(new Map([["other", "123"]])),
    /collectionUnexpected/,
  );
  const answers = new Map([
    ["ready", "false"],
    ["method", "m1"],
  ]);
  answers.set("method", "线上");
  assert.throws(() => write(answers), /collectionInvalidAnswer/);
  answers.set("method", "m1");
  const original = write(answers);
  const response = JSON.parse(original);
  assert.deepEqual(Object.keys(response), [
    "format",
    "version",
    "requestId",
    "responseId",
    "fields",
  ]);
  assert.equal(response.format, "veraflow-collection-response");
  assert.equal(response.requestId, specimen.requestId);
  assert.match(response.responseId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(response.fields, { ready: "false", method: "m1" });
  answers.set("comments", " \n\n");
  assert.equal(write(answers), original);
  answers.set("comments", "第一行\n\n第二行");
  answers.set("__proto__", "000184");
  const updated = write(answers);
  const parsed = JSON.parse(updated);
  assert.notEqual(parsed.responseId, response.responseId);
  assert.equal(parsed.fields.comments, "第一行\n第二行");
  assert.equal(parsed.fields["__proto__"], "000184");
  assert.equal(write(answers), updated);
});

const desktop =
  resolve(process.env.VERAFLOW_DESKTOP_DIR ?? fileURLToPath(new URL("../../../", import.meta.url)));
const hasCollection =
  existsSync(join(desktop, "src/core/collection.ts")) &&
  existsSync(join(desktop, "node_modules/tsx/package.json"));
test(
  "Mandarin answers from Web review in the originating Desktop record",
  {
    skip: hasCollection
      ? false
      : "Run npm ci at the repository root to enable the Desktop CLI test.",
  },
  async (t) => {
    const directory = await scratch(t);
    const demo = join(desktop, "examples/source/collection");
    const cli = join(desktop, "scripts/veraflow");
    const command = (...args) =>
      execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const mapped = join(directory, "mapped.vf");
    await writeFile(
      mapped,
      command(
        "map",
        join(demo, "veradata-selection.json"),
        join(demo, "veradata-mapping.json"),
        "--form",
        join(demo, "employment.vf"),
      ),
    );
    const working = join(directory, "private.vf");
    const request = readCollectionRequest(
      command("collection-request", mapped, "--output", working),
    );
    assert.deepEqual(
      request.questions.map(({ id }) => id),
      ["job_title", "comments"],
    );
    const html = exportCollectionHtml(request, "zh-CN");
    assert.doesNotMatch(
      html,
      /Juniper Example Labs|Xiaoming Example|employment_status|recordState|Registration:/,
    );
    const answers = JSON.parse(
      await readFile(join(demo, "answers.json"), "utf8"),
    );
    const response = join(directory, "response.json");
    await writeFile(
      response,
      collectionResponseWriter(request)(new Map(Object.entries(answers))),
    );
    const review = JSON.parse(command("collection-review", response, working));
    assert.equal(review.status, "review");
    assert.deepEqual(
      Object.fromEntries(
        review.changes.map(({ field, value }) => [field, value]),
      ),
      answers,
    );
    const unrelated = spawnSync(
      process.execPath,
      [cli, "collection-review", response, mapped],
      {
        encoding: "utf8",
      },
    );
    assert.equal(unrelated.status, 1);
    assert.match(unrelated.stderr, /different working record/i);

    for (const include of [false, true]) {
      const filename = join(
        directory,
        include ? "prefilled.html" : "reusable.html",
      );
      execFileSync(process.execPath, [
        fileURLToPath(script),
        ...(include ? ["--include-responses"] : []),
        working,
        filename,
      ]);
      const exported = embeddedTemplate(
        await readFile(filename, "utf8"),
      ).content;
      assert.doesNotMatch(exported, /recordState|verification/);
      assert.ok(!exported.includes(request.requestId));
      assert.equal(exported.includes("Juniper Example Labs"), include);
    }
  },
);
