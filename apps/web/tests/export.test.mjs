import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  example,
  expected,
  inputs,
  script,
  source,
  shipmentExample,
  shipmentSource,
  shipment,
  housingExample,
  housingResponse,
  embeddedTemplate,
  serviceExample,
  serviceFile,
} from "./fixtures.mjs";

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
  const data = embeddedTemplate(html);
  assert.equal(data.name, title);
  assert.ok(!html.includes("PRIVATE_CASE_DATA"));
  assert.ok(!html.includes("</title><script>"));
  assert.ok(!data.content.includes('"verification"'));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(
    html,
    /Created with<\/span> <a href="https:\/\/github\.com\/iandorsey00\/veraflow\/tree\/main\/apps\/web"[^>]*>VeraFlow Web<\/a> v/,
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

test("timestamps HTML destinations on request and preserves long Unicode filenames", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "工".repeat(80) + ".vf");
  await writeFile(input, source);
  const timestamp = String.raw`\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}Z`;
  run(input, join(directory, "report.html"), [
    "--timestamp",
    "--include-source-name",
  ]);
  execFileSync(
    process.execPath,
    [fileURLToPath(script), "--timestamp", input],
    { stdio: "pipe" },
  );
  const files = await readdir(directory);
  const report = files.find((file) => file.startsWith("report"));
  assert.match(report, new RegExp(`^report-${timestamp}\\.html$`));
  assert.match(
    await readFile(join(directory, report), "utf8"),
    /"sourceName":\s*"工+/,
  );
  const longExport = files.find(
    (file) => file.endsWith(".html") && file !== report,
  );
  assert.match(longExport, new RegExp(`^工+-${timestamp}\\.html$`));
  assert.ok(Buffer.byteLength(longExport) <= 255);
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

async function loadCore(coreDir) {
  const core = await build({
    stdin: {
      contents:
        'export * from "./session"; export * from "./source"; export * from "./source-record"; export * from "./candidates";',
      resolveDir: coreDir,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    tsconfig: resolve("tsconfig.json"),
    nodePaths: [resolve("node_modules")],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(core.outputFiles[0].contents).toString("base64")}`
  );
}

const sharedCore = fileURLToPath(new URL("../../../src/core", import.meta.url));
const desktop = process.env.VERAFLOW_DESKTOP_DIR;
const desktopCore = desktop ? resolve(desktop, "src/core") : sharedCore;

test("same named sections and literal Unicode as VeraFlow desktop", async (t) => {
  const directory = await sandbox(t);
  const { renderTemplateValues } = await loadCore(desktopCore);
  const output = join(directory, "case.html");
  run(fileURLToPath(example), output);
  const html = await readFile(output, "utf8");
  const template = embeddedTemplate(html);
  const values = new Map(Object.entries(inputs));
  assert.deepEqual(renderTemplateValues(template, values, "email"), [
    { id: "subject", label: "Subject", text: expected.subject },
    { id: "body", label: "Body", text: expected.body },
  ]);
  assert.deepEqual(renderTemplateValues(template, values, "ticket"), [
    { id: "note", label: "Note", text: expected.note },
  ]);
});

test("shipment steps share verified values and retain copied-section warnings until recopy", async (t) => {
  const directory = await sandbox(t);
  const runtime = await loadCore(sharedCore);
  const desktopRuntime = await loadCore(desktopCore);
  if (desktop) {
    assert.equal(
      await readFile(
        join(resolve(desktop), "examples/source/shipment-steps.veraflow"),
        "utf8",
      ),
      shipmentSource,
    );
  }
  const output = join(directory, "shipment.html");
  run(fileURLToPath(shipmentExample), output);
  const html = await readFile(output, "utf8");
  const template = embeddedTemplate(html);
  const state = runtime.startSession(template);
  state.unifiedForm = true;
  runtime.prepareWorkflow(state, true);

  function enter(name, value) {
    state.active = state.fields.findIndex((field) => field.name === name);
    runtime.capture(state, value, false);
  }
  function check(value) {
    state.active = state.fields.findIndex(
      (field) => field.name === "Reference",
    );
    state.mode = "verify";
    return runtime.verify(state, value, false);
  }
  function prepare() {
    const values = new Map(
      state.fields
        .filter((field) => field.value !== null)
        .map(({ name, value }) => [name, value]),
    );
    state.prepared = runtime.prepareSections(state);
    assert.deepEqual(
      state.prepared,
      desktopRuntime.renderTemplateValues(
        template,
        values,
        state.outputId,
        state.sourceContext,
      ),
    );
    runtime.noteStepPrepared(state);
    return state.prepared.map(({ text }) => text);
  }
  const { firstReference, newReference, recipient, tracking } = shipment;
  assert.equal(state.outputId, "dispatch");
  enter("Reference", firstReference);
  enter("Recipient", recipient);
  assert.throws(() => prepare(), /unverified/);
  assert.equal(check("VF-999"), false);
  assert.equal(state.fields[state.active].value, firstReference);
  assert.equal(check(firstReference), true);
  assert.deepEqual(prepare(), [
    "Shipment VF-104",
    "Hello Alex, shipment VF-104 is ready for pickup.",
  ]);
  runtime.noteStepTransfer(state);
  runtime.activateFormStep(state, 1);
  enter("Tracking", tracking);
  assert.deepEqual(prepare(), ["Shipment VF-104 picked up. Tracking: PK-12."]);
  runtime.activateFormStep(state, 0);
  enter("Reference", newReference);
  assert.throws(() => prepare(), /unverified/);
  assert.deepEqual(
    [...state.stepOutputs.get("dispatch").staleSections],
    ["subject", "body"],
  );
  assert.equal(state.stepOutputs.get("pickup").needsReview, true);
  assert.equal(check(newReference), true);
  assert.deepEqual(prepare(), [
    "Shipment VF-105",
    "Hello Alex, shipment VF-105 is ready for pickup.",
  ]);
  assert.equal(state.stepOutputs.get("dispatch").needsReview, false);
  runtime.noteStepTransfer(state, "subject");
  assert.deepEqual(
    [...state.stepOutputs.get("dispatch").staleSections],
    ["body"],
  );
  runtime.noteStepTransfer(state, "body");
  assert.equal(state.stepOutputs.get("dispatch").staleSections.size, 0);
  runtime.activateFormStep(state, 1);
  assert.equal(
    state.fields.find((field) => field.name === "Tracking").value,
    tracking,
  );
  assert.deepEqual(prepare(), ["Shipment VF-105 picked up. Tracking: PK-12."]);
});

test("rejects a stepped export with a forward reference", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "future.vf");
  await writeFile(
    input,
    shipmentSource.replace("Shipment {{Reference}}", "Shipment {{Tracking}}"),
  );
  assert.throws(
    () => run(input, join(directory, "form.html")),
    /Output "dispatch" uses "Tracking" before its step/,
  );
});

test("JSON5 headers use desktop validation and exported source remains readable", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "housing.veraflow");
  const output = join(directory, "housing.html");
  const original = await readFile(housingExample, "utf8");
  const content = original.replaceAll("\n", "\r\n");
  await writeFile(input, content);
  run(input, output);
  const html = await readFile(output, "utf8");
  assert.equal(embeddedTemplate(html).content, content);
  assert.match(html, /<!-- Standalone form styles -->/);
  assert.match(html, /<main id="form">[\s\S]*?<section id="output-panel"/);
  assert.match(html, /<!-- Embedded definition\./);
  assert.match(html, /"sourceLines": \[\n/);
  assert.match(html, /<!-- Bundled offline runtime -->\n    <script>\n/);
  assert.match(html, /\n  function createOutput\(all\)/);
  assert.match(html, /@humanwhocodes\/momoa 3\.3\.13/);

  for (const [header, failure] of [
    ['"title": "Duplicate",', /Duplicate metadata key "title"/],
    ["unused: Infinity,", /Metadata numbers must be finite/],
    ["unused: 1e999,", /Metadata numbers must be finite/],
  ]) {
    await writeFile(input, original.replace("{\n", `{\n  ${header}\n`));
    assert.throws(() => run(input, join(directory, "invalid.html")), failure);
  }
});

test("prefill is opt-in and discards saved verification while preserving explicit empty and null values", async (t) => {
  const directory = await sandbox(t);
  const input = join(directory, "saved.vf");
  const blank = join(directory, "blank.html");
  const included = join(directory, "included.html");
  const content = (await readFile(housingExample, "utf8")).replace(
    "  fields:",
    `  responses: { legal_name: 'Private Name', moving_reason: null, reason_en: '' },
  verification: { legal_name: 'form' },
  fields:`,
  );
  await writeFile(input, content);
  run(input, blank);
  assert.doesNotMatch(await readFile(blank, "utf8"), /Private Name/);
  run(input, included, ["--include-responses"]);
  const core = await loadCore(sharedCore);
  const template = embeddedTemplate(await readFile(included, "utf8"));
  const parsed = core.parseSource(template.content);
  assert.deepEqual(Object.fromEntries(parsed.responses), {
    legal_name: "Private Name",
    moving_reason: null,
    reason_en: "",
  });
  assert.equal(parsed.verification.size, 0);
  const session = core.startSession(template);
  assert.equal(
    session.fields.find((field) => field.name === "legal_name").status,
    "captured",
  );

  const record = join(directory, "record.json5");
  for (const [invalid, message] of [
    ['{"legal_name":"First","legal_name":"Second"}', /legal_name occurs more than once/],
    ['{legal_name: {name: "Drew"}}', /legal_name contains an object or array/],
    ['{legal_name: Infinity}', /legal_name needs a finite number/],
    ['{Legal_name: "Drew"}', /Unknown field Legal_name/],
  ]) {
    await writeFile(record, invalid);
    assert.throws(
      () =>
        run(input, join(directory, "invalid.html"), ["--responses", record]),
      message,
    );
  }

  await writeFile(record, "{legal_name: 'Drew',}");
  const json5 = join(directory, "json5.html");
  run(input, json5, ["--responses", record]);
  const imported = core.parseSource(embeddedTemplate(await readFile(json5, "utf8")).content);
  assert.equal(imported.responses.get("legal_name"), "Drew");
  assert.equal(imported.responses.get("moving_reason"), null);
  assert.equal(imported.responses.get("reason_en"), "");
});

test("the bilingual housing form renders desktop outputs and its response JSON can be reviewed and merged", async (t) => {
  const directory = await sandbox(t);
  const output = join(directory, "prefilled.html");
  run(fileURLToPath(housingExample), output, [
    "--responses",
    fileURLToPath(housingResponse),
  ]);
  const template = embeddedTemplate(await readFile(output, "utf8"));
  const core = await loadCore(sharedCore);
  const desktop = await loadCore(desktopCore);
  const browserResponseModule = await build({
    entryPoints: ["src/responses.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { responseJson } = await import(
    `data:text/javascript;base64,${Buffer.from(browserResponseModule.outputFiles[0].contents).toString("base64")}`
  );
  const s = core.startSession(template);
  s.unifiedForm = true;
  core.prepareWorkflow(s, true);
  const parsed = core.parseSource(template.content);
  const included = new Set(parsed.responses.keys());
  assert.deepEqual(
    parsed.steps.map(({ outputs }) => outputs),
    [[], ["application", "review"]],
  );
  assert.equal(s.outputId, undefined);
  assert.deepEqual(
    JSON.parse(responseJson(s, included)),
    JSON.parse(await readFile(housingResponse, "utf8")),
  );

  function verifyName(name) {
    s.active = s.fields.findIndex((field) => field.name === "legal_name");
    s.mode = "verify";
    assert.equal(core.verify(s, name, false), true);
  }
  function prepare(id, expected) {
    const candidate = { ...s, outputId: id };
    const parts = core.prepareSections(candidate);
    assert.equal(parts[0].text, expected);
    const values = new Map(
      [...core.recordValues(s)].filter(([, value]) => value !== null),
    );
    assert.deepEqual(
      parts,
      desktop.renderTemplateValues(template, values, id, s.sourceContext),
    );
    core.noteStepPrepared(s, id);
    core.noteStepTransfer({ ...candidate, prepared: parts });
  }
  assert.ok(core.formAttention(s).some(({ check }) => check));
  verifyName("Drew Example");
  assert.deepEqual(core.formAttention(s), []);
  core.activateFormStep(s, 1);
  assert.equal(s.outputId, "review");
  const reason = s.fields.findIndex((field) => field.name === "reason_en");
  s.active = reason;
  const english = "My current home is too far from work.";
  core.capture(s, english, false);
  included.add("reason_en");
  prepare(
    "application",
    `Name: Drew Example\nEmployment: Employed\nReason for moving: ${english}`,
  );
  prepare(
    "review",
    "姓名：Drew Example\n就业状态：在职\n搬家原因：现在的住处离公司太远。",
  );
  core.activateFormStep(s, 0);
  s.active = s.fields.findIndex((field) => field.name === "legal_name");
  core.capture(s, "Alex Example", false);
  assert.ok(s.stepOutputs.get("application").staleSections.size);
  assert.ok(s.stepOutputs.get("review").staleSections.size);
  assert.ok(core.formAttention(s).some(({ check }) => check));
  assert.equal(s.fields[reason].value, english);
  const target = desktop.startSession({
    ...template,
    content: await readFile(housingExample, "utf8"),
  });
  const changes = desktop.planRecordValues(target, desktop.readRecordInput(responseJson(s, included)));
  assert.ok(
    changes.some(
      ({ index, previous, value }) =>
        target.fields[index].name === "legal_name" &&
        previous === null &&
        value === "Alex Example",
    ),
  );
  assert.equal(
    target.fields.find((field) => field.name === "legal_name").value,
    null,
  );
  desktop.applyRecordChanges(target, changes);
  assert.equal(
    target.fields.find((field) => field.name === "legal_name").status,
    "captured",
  );
  assert.deepEqual(
    Object.fromEntries(desktop.recordValues(target)),
    JSON.parse(responseJson(s, included)),
  );

  core.applyRecordChanges(s, [{ index: reason, value: "" }]);
  const movingReason = s.fields.findIndex(
    (field) => field.name === "moving_reason",
  );
  core.applyRecordChanges(s, [{ index: movingReason, value: null }]);
  included.delete("employment");
  assert.deepEqual(JSON.parse(responseJson(s, included)), {
    legal_name: "Alex Example",
    moving_reason: null,
    reason_en: "",
  });
  const sparseChanges = desktop.planRecordValues(
    target,
    desktop.readRecordInput(responseJson(s, included)),
  );
  assert.ok(
    !sparseChanges.some(
      ({ index }) => target.fields[index].name === "employment",
    ),
  );
  desktop.applyRecordChanges(target, sparseChanges);
  assert.equal(
    target.fields.find((field) => field.name === "employment").value,
    "employed",
  );
  assert.equal(
    target.fields.find((field) => field.name === "moving_reason").value,
    null,
  );
  assert.equal(
    target.fields.find((field) => field.name === "reason_en").value,
    "",
  );
});

test("CLI update follows stable Web tags and protects local edits anywhere in the repository", async (t) => {
  const directory = await sandbox(t);
  const upstream = join(directory, "upstream");
  const checkout = join(directory, "checkout");
  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-b", "main", upstream);
  git("-C", upstream, "config", "user.name", "VeraFlow Test");
  git("-C", upstream, "config", "user.email", "test@example.com");
  await writeFile(join(upstream, ".gitignore"), "dist/\nnode_modules/\n");
  await writeFile(join(upstream, "package.json"), '{"name":"veraflow","version":"99.0.0"}');
  const upstreamWeb = join(upstream, "apps/web");
  await mkdir(upstreamWeb, { recursive: true });
  async function commitRelease(release) {
    const name = "veraflow-web";
    await writeFile(
      join(upstreamWeb, "package.json"),
      JSON.stringify({
        name,
        version: release,
        scripts: {
          build:
            "node -e \"require('fs').writeFileSync('dist/version.json', process.env.npm_package_version)\"",
        },
      }),
    );
    await writeFile(
      join(upstreamWeb, "package-lock.json"),
      JSON.stringify({
        name,
        version: release,
        lockfileVersion: 3,
        packages: { "": { name, version: release } },
      }),
    );
    git("-C", upstream, "add", ".");
    git("-C", upstream, "commit", "-m", `Test release ${release}`);
    git("-C", upstream, "tag", `web-v${release}`);
  }
  await commitRelease(version);
  git("clone", upstream, checkout);
  const web = join(checkout, "apps/web");
  await mkdir(join(web, "dist"));
  const cli = join(web, "dist", "export-html.mjs");
  await copyFile(script, cli);
  const runUpdate = () =>
    execFileSync(process.execPath, [cli, "--update"], {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, npm_config_offline: "true" },
    });
  assert.match(runUpdate(), /is current/);
  const parts = version.split(".");
  const newer = `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
  await commitRelease(newer);
  git("-C", upstream, "tag", "v99.0.0");
  git("-C", upstream, "tag", "web-v99.0.0-beta.1");
  const dirty = join(checkout, "draft.txt");
  await writeFile(dirty, "uncommitted");
  assert.throws(runUpdate, /local changes before updating/);
  assert.equal(await readFile(dirty, "utf8"), "uncommitted");
  await rm(dirty);
  assert.match(runUpdate(), /Updated VeraFlow Web to/);
  assert.equal(
    await readFile(join(web, "dist", "version.json"), "utf8"),
    newer,
  );
  assert.equal(
    git("-C", checkout, "rev-parse", "HEAD"),
    git("-C", upstream, "rev-parse", "HEAD"),
  );
});

test("display replacement candidates stay separate from the desktop response round-trip", async (t) => {
  const directory = await sandbox(t);
  const output = join(directory, "display-replacement.html");
  run(fileURLToPath(serviceExample), output);
  const html = await readFile(output, "utf8");
  const template = embeddedTemplate(html);
  assert.match(html, /<!-- Source acquisition and candidate review -->/);
  assert.match(html, /<dialog id="candidate-review"/);
  assert.match(html, /function setupExtraction/);
  assert.doesNotMatch(html, /ABC123458|Sarah Example/);
  const core = await loadCore(sharedCore);
  const desktopCoreApi = await loadCore(desktopCore);
  const session = core.startSession(template);
  session.unifiedForm = true;
  session.outputId = "ticket";
  session.stepOutputs ??= new Map();
  core.prepareWorkflow(session, true);
  const fields = core.candidateFields(session);
  const lead = await readFile(serviceFile("service-intake-source.txt"), "utf8");
  const extracted = core.extractCandidates(fields, lead);
  const disputed = extracted.get("serial_number");
  assert.equal(disputed.status, "ambiguous");
  assert.deepEqual(
    disputed.alternatives.map(({ value }) => value),
    ["ABC123456", "ABC123458"],
  );
  assert.equal(disputed.alternatives[1].evidence[0].quote, "序列号：ABC123458");
  const candidateJson = JSON.stringify(core.candidateFile(extracted));
  assert.equal(
    JSON.stringify(
      core.candidateFile(core.importCandidateFile(fields, candidateJson, lead)),
    ),
    candidateJson,
  );
  const description = core.extractionFields(session);
  assert.equal(description.format, "veraflow-extraction-fields");
  assert.deepEqual(
    description.fields.find(({ id }) => id === "serial_number").aliases,
    ["Serial", "序列号"],
  );
  assert.notEqual(
    description.fields.find(({ id }) => id === "shipping_address").instructions,
    undefined,
  );

  const apply = (values) => {
    const changes = core.planRecordValues(session, values);
    core.applyRecordChanges(session, changes);
  };
  const selectFound = (candidates) =>
    new Map(
      [...candidates]
        .filter(([, candidate]) => candidate.status === "found")
        .map(([field, candidate]) => [field, candidate.alternatives[0].value]),
    );
  function verifySerial(value) {
    session.active = session.fields.findIndex(
      ({ name }) => name === "serial_number",
    );
    session.mode = "verify";
    return core.verify(session, value, false);
  }

  const first = selectFound(extracted);
  assert.equal(first.has("serial_number"), false);
  first.set("serial_number", disputed.alternatives[1].value);
  apply(first);
  assert.equal(verifySerial("ABC123456"), false);
  assert.equal(core.recordValues(session).get("serial_number"), "ABC123458");
  assert.equal(verifySerial("ABC123458"), true);
  assert.deepEqual(
    core.planRecordValues(session, new Map([["serial_number", "ABC123458"]])),
    [],
  );
  assert.equal(session.fields[session.active].status, "verified");

  const emailSource = await readFile(
    serviceFile("service-intake-email.txt"),
    "utf8",
  );
  const emailFile = await readFile(
    serviceFile("service-email-candidates.json"),
    "utf8",
  );
  assert.throws(
    () => core.importCandidateFile(fields, emailFile, lead),
    /candidateEvidenceMismatch/,
  );
  assert.throws(
    () =>
      core.importCandidateFile(
        fields,
        emailFile.replace('"version": 1', '"version": 1, "version": 1'),
      ),
    /invalidCandidateFile/,
  );
  const email = core.importCandidateFile(fields, emailFile, emailSource);
  const emailValues = selectFound(email);
  assert.equal(emailValues.get("quantity_affected"), "1");
  assert.equal(email.get("shipping_address").status, "not_found");
  apply(emailValues);
  assert.equal(core.recordValues(session).get("shipping_address"), null);
  assert.equal(
    session.fields.find(({ name }) => name === "serial_number").status,
    "captured",
  );

  const callSource = await readFile(
    serviceFile("service-intake-call.txt"),
    "utf8",
  );
  const callFile = await readFile(
    serviceFile("service-call-candidates.json"),
    "utf8",
  );
  const correction = core.importCandidateFile(fields, callFile, callSource);
  apply(selectFound(correction));
  assert.throws(() => core.prepareSections(session), /unverified/);
  assert.equal(verifySerial("ABC123458"), true);
  const values = new Map(
    [...core.recordValues(session)].filter(([, value]) => value !== null),
  );
  const sections = core.prepareSections(session);
  assert.deepEqual(
    sections,
    desktopCoreApi.renderTemplateValues(
      template,
      values,
      "ticket",
      session.sourceContext,
    ),
  );
  assert.match(sections[0].text, /V6530 · 1 affected · serial ABC123458/);
  assert.doesNotMatch(
    JSON.stringify(core.extractionFields(session)),
    /ABC123458|949-555-0100/,
  );
  const response = JSON.stringify(Object.fromEntries(values));
  const desktopSession = desktopCoreApi.startSession(template);
  assert.throws(
    () => desktopCoreApi.readRecordInput(callFile),
    /recordInputNested/,
  );
  const changes = desktopCoreApi.planRecordValues(desktopSession, desktopCoreApi.readRecordInput(response));
  assert.equal(
    desktopCoreApi.recordValues(desktopSession).get("serial_number"),
    null,
  );
  desktopCoreApi.applyRecordChanges(desktopSession, changes);
  assert.equal(
    desktopCoreApi.recordValues(desktopSession).get("serial_number"),
    "ABC123458",
  );
  assert.equal(
    desktopCoreApi.recordValues(desktopSession).get("shipping_address"),
    null,
  );
  assert.equal(
    desktopSession.fields.find(({ name }) => name === "serial_number").status,
    "captured",
  );
});

test("dispatch exchange shares candidate fields, response values, and ordered output JSON with Desktop", async (t) => {
  const directory = await sandbox(t);
  const form = fileURLToPath(new URL("../examples/dispatch-exchange.vf", import.meta.url));
  const lead = fileURLToPath(new URL("../examples/dispatch-exchange.txt", import.meta.url));
  const html = join(directory, "dispatch.html");
  run(form, html);
  const core = await loadCore(sharedCore);
  const template = embeddedTemplate(await readFile(html, "utf8"));
  const session = core.startSession(template);
  const source = core.parseSource(template.content);
  session.unifiedForm = true;
  core.prepareWorkflow(session, true);
  assert.equal(source.defaultOutput, "log");
  const fields = core.extractionFields(session);
  assert.deepEqual(fields.fields.map(({ id }) => id), ["route", "reference", "tracking", "delivery_code"]);
  assert.deepEqual(fields.fields[0].options.map(({ id }) => id), ["ground", "air"]);

  function desktopCli(...args) {
    return execFileSync(process.execPath, [
      resolve(desktop, "scripts/veraflow"), ...args,
    ], { encoding: "utf8" });
  }
  const sourceText = await readFile(lead, "utf8");
  const candidateFields = core.candidateFields(session);
  const localCandidates = core.candidateFile(core.extractCandidates(candidateFields, sourceText));
  const candidateJson = desktop ? desktopCli("extract", lead, form) : JSON.stringify(localCandidates);
  if (desktop) {
    assert.deepEqual(JSON.parse(desktopCli("fields", form)), JSON.parse(JSON.stringify(fields)));
  }
  const reviewed = core.importCandidateFile(candidateFields, candidateJson, sourceText);
  assert.equal(JSON.stringify(core.candidateFile(reviewed)), JSON.stringify(localCandidates));
  assert.equal(reviewed.get("reference").alternatives[0].evidence[0].quote, "Reference: 000184");
  const selected = new Map([
    ["reference", reviewed.get("reference").alternatives[0].value],
    ["route", reviewed.get("route").alternatives[0].value],
  ]);
  core.applyRecordChanges(session, core.planRecordValues(session, selected));
  const optionalValues = core.readRecordInput("{tracking: null, delivery_code: '',}");
  core.applyRecordChanges(session, core.planRecordValues(session, optionalValues));

  const module = await build({
    stdin: {
      contents: 'export * from "./src/responses"; export * from "./src/output-json";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { responseJson, outputJson } = await import(
    `data:text/javascript;base64,${Buffer.from(module.outputFiles[0].contents).toString("base64")}`
  );
  const response = responseJson(session, new Set([...selected.keys(), ...optionalValues.keys()]));
  assert.deepEqual(JSON.parse(response), {
    reference: "000184",
    route: "ground",
    tracking: null,
    delivery_code: "",
  });
  const outputs = source.outputs.map(({ id, label }) => ({
    id,
    label,
    sections: core.prepareSections({ ...session, outputId: id }),
  }));
  const single = JSON.parse(outputJson([outputs[1]]));
  assert.deepEqual(core.prepareSections(session), single.outputs[0].sections);
  assert.deepEqual(single, {
    format: "veraflow-render",
    version: 1,
    outputs: [{
      id: "log",
      label: "Dispatch log",
      sections: [{ id: "body", label: "Log entry", text: "000184 | Ground service | Tracking:  | Delivery code: " }],
    }],
  });
  assert.deepEqual(outputs[0].sections.map(({ id }) => id), ["subject", "body"]);
  if (desktop) {
    const record = join(directory, "responses.json");
    await writeFile(record, response);
    desktopCli("validate", form, "--record", record);
    assert.deepEqual(single, JSON.parse(desktopCli("render", record, form, "--format", "json")));
    assert.deepEqual(
      JSON.parse(outputJson(outputs)),
      JSON.parse(desktopCli("render", record, form, "--all", "--format", "json")),
    );
  }
});

test("static assets use relative hashed paths and the independent Web version", async () => {
  const index = await readFile("dist/index.html", "utf8");
  const assets = [...index.matchAll(/(?:src|href)="\.\/((?:web|style)-([0-9a-f]{12})\.(?:js|css))"/g)];
  assert.equal(assets.length, 2);
  for (const [, file, fingerprint] of assets) {
    const bytes = await readFile(join("dist", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 12), fingerprint);
  }
  assert.deepEqual(JSON.parse(await readFile("dist/version.json", "utf8")), { version });
  const core = JSON.parse(await readFile("../../package.json", "utf8"));
  assert.match(await readFile(join("dist", assets.find((match) => match[1].endsWith(".js"))[1]), "utf8"), new RegExp(core.version.replaceAll(".", "\\.")));
});
