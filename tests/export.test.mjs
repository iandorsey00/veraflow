import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { example, expected, inputs, script, source } from "./fixtures.mjs";

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-export-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function run(input, output, flags = []) {
  return execFileSync(
    process.execPath,
    [fileURLToPath(script), ...flags, input, output],
    { encoding: "utf8", stdio: "pipe" },
  );
}

test("exports a locked-down file and strips saved session data", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "unsafe-name.vf");
  const output = join(directory, "form.html");
  const title = 'Case </title><script>throw Error("injected")</script>';
  await writeFile(
    input,
    source.replace(
      '"title": "Service shipment",',
      `"title": ${JSON.stringify(title)}, "responses": {"tracking": "PRIVATE_CASE_DATA"}, "verification": {"tracking": "form"},`,
    ),
  );
  run(input, output);
  const html = await readFile(output, "utf8");
  const data = JSON.parse(
    html.match(
      /<script type="application\/json" id="definition">([^]*?)<\/script>/,
    )[1],
  );
  assert.equal(data.name, title);
  assert.ok(!html.includes("PRIVATE_CASE_DATA"));
  assert.ok(!html.includes("</title><script>"));
  assert.ok(!data.content.includes('"verification"'));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(
    html,
    /Created with<\/span> <a href="https:\/\/github\.com\/iandorsey00\/veraflow-web"[^>]*>VeraFlow Web<\/a> v/,
  );
  assert.ok(html.includes(`VeraFlow Web</a> v${version}`));
  for (const [tag, directive] of [
    ["script", "script-src"],
    ["style", "style-src"],
  ]) {
    const code = html.match(new RegExp(`<${tag}>([^]*?)</${tag}>`))[1];
    const hash = createHash("sha256").update(code).digest("base64");
    assert.ok(html.includes(`${directive} 'sha256-${hash}'`));
  }
  assert.throws(() => run(input, output), /output file already exists/);
  assert.equal(await readFile(output, "utf8"), html);
});

test("the source filename is opt-in and remains literal in embedded provenance", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "内部工单 & source.vf");
  const plain = join(directory, "public.html");
  const withProvenance = join(directory, "internal.html");
  await writeFile(input, source);
  run(input, plain);
  run(input, withProvenance, ["--include-source-name"]);
  const metadata = async (file) => {
    const html = await readFile(file, "utf8");
    assert.match(html, /data-text="createdEnd">\.<\/span>/);
    return JSON.parse(html.match(/id="provenance">([^]*?)<\/script>/)[1]);
  };
  assert.deepEqual(await metadata(plain), {});
  assert.deepEqual(await metadata(withProvenance), {
    sourceName: "内部工单 & source.vf",
  });
});

test("rejects runtime-only workflows and variables, including inside unused branches", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "test.veraflow");
  const output = join(directory, "form.html");
  const header = (metadata, body) =>
    `--- veraflow 2\n${JSON.stringify(metadata)}\n---\n${body}\n`;
  for (const [definition, error] of [
    [
      header({ workflow: "csv", csv: { file: "records.csv" } }, "{{case}}"),
      /linked CSV/,
    ],
    [
      header(
        { workflow: "append", append: { file: "records.csv" } },
        "{{case}}",
      ),
      /append to CSV/,
    ],
    [
      source.replace(
        "Airport: {{airport}}.",
        "Airport: {{@clipboard}} {{airport}}.",
      ),
      /@clipboard/,
    ],
    [header({}, "{{@selection}}"), /@selection/],
    [header({}, "{{@selection-or-clipboard}}"), /@selection-or-clipboard/],
    [header({}, "{{@row}}"), /@row/],
    ["--- veraflow 2\n{}", /line 1.*End the JSON header/],
  ]) {
    await writeFile(input, definition);
    assert.throws(() => run(input, output), error);
  }
});

test("same named sections and literal Unicode as VeraFlow desktop", async (t) => {
  const directory = await sandbox(t);
  const desktop = process.env.VERAFLOW_DESKTOP_DIR;
  const coreDir = resolve(
    desktop ? join(desktop, "src/core") : "vendor/veraflow/core",
  );
  const core = await build({
    stdin: {
      contents: 'export * from "./session";',
      resolveDir: coreDir,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { renderTemplateValues } = await import(
    `data:text/javascript;base64,${Buffer.from(core.outputFiles[0].contents).toString("base64")}`
  );
  const output = join(directory, "case.html");
  run(fileURLToPath(example), output);
  const html = await readFile(output, "utf8");
  const template = JSON.parse(
    html.match(/id="definition">([^]*?)<\/script>/)[1],
  );
  const values = new Map(Object.entries(inputs));
  assert.deepEqual(renderTemplateValues(template, values, "email"), [
    { id: "subject", label: "Subject", text: expected.subject },
    { id: "body", label: "Body", text: expected.body },
  ]);
  assert.deepEqual(renderTemplateValues(template, values, "ticket"), [
    { id: "note", label: "Note", text: expected.note },
  ]);
});
