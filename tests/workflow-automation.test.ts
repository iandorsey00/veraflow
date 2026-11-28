import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  createCollectionResponse,
  readCollectionRequest,
} from "../src/core/collection";
import {
  acquireWorker,
  associateQuestionnaire,
  changeExecution,
  claimExecution,
  createInstance,
  findInstance,
  finishExecution,
  registerWorkflow,
  requestQuestionnaire,
  resolveResponse,
  setPaused,
  supplyValues,
  verifyValue,
} from "../src/workflow/engine";
import { importResponseFile, ResponseInbox } from "../src/workflow/inbox";
import { readWorkflow } from "../src/workflow/spec";
import { WorkflowDatabase } from "../src/workflow/store";

const demo = new URL("../examples/source/collection/", import.meta.url);
const workflowText = await readFile(
  new URL("employment-workflow.json5", demo),
  "utf8",
);
const form = await readFile(new URL("employment.vf", demo), "utf8");
const workflow = readWorkflow(workflowText, true);
const initial = JSON.stringify({
  full_name: "Chen Example",
  employment_status: "employed",
  employer: "Fictional Lab",
});

async function setup(t: TestContext) {
  const folder = await mkdtemp(join(tmpdir(), "veraflow-workflow-test-"));
  const connections: WorkflowDatabase[] = [];
  const connect = () => {
    const db = new WorkflowDatabase(folder);
    connections.push(db);
    return db;
  };
  const db = connect();
  t.after(async () => {
    for (const connection of connections) connection.close();
    await rm(folder, { recursive: true, force: true });
  });
  await db.update((state) => registerWorkflow(state, workflow, form));
  return { db, folder, connect };
}

test("JSON5 authoring and strict interchange reject duplicate keys and pin each revision", async (t) => {
  assert.throws(() => readWorkflow(workflowText), /invalidWorkflow/);
  assert.deepEqual(readWorkflow(JSON.stringify(workflow)), workflow);
  assert.throws(
    () =>
      readWorkflow(
        workflowText.replace("version: 1", 'version: 2, "version": 1'),
        true,
      ),
    /invalidWorkflow/,
  );
  const { db } = await setup(t);
  await assert.rejects(
    db.update((state) => registerWorkflow(state, workflow, form)),
    /workflowRevisionExists/,
  );
  const first = await db.update((state) => createInstance(state, workflow.id));
  await db.update((state) =>
    registerWorkflow(state, { ...workflow, revision: "2" }, form),
  );
  const second = await db.update((state) => createInstance(state, workflow.id));
  assert.equal(first.revision, "1");
  assert.equal(second.revision, "2");
  assert.equal(findInstance(db.read(), first.id).revision, "1");
});

test("inbox recovers a partial file after restart, applies conditional rounds and isolates respondents", async (t) => {
  const { folder, db, connect } = await setup(t);
  const anotherConnection = connect();
  const [first, second] = await Promise.all([
    db.update((state) => createInstance(state, workflow.id)),
    anotherConnection.update((state) => createInstance(state, workflow.id)),
  ]);
  assert.notEqual(first.id, second.id);
  const req = await db.update((state) => requestQuestionnaire(state, first.id));
  assert.deepEqual(
    new Set(req.questions.map(({ id }) => id)),
    new Set(["full_name", "employment_status", "comments"]),
  );
  assert.deepEqual(
    readCollectionRequest(JSON.stringify(req)),
    JSON.parse(JSON.stringify(req)),
  );
  await assert.rejects(
    db.update((state) =>
      associateQuestionnaire(
        state,
        first.id,
        req.requestId,
        "https://script.google.com/macros/s/owner/exec",
      ),
    ),
    /invalidRespondentUrl/,
  );
  await db.update((state) =>
    associateQuestionnaire(
      state,
      first.id,
      req.requestId,
      "https://docs.google.com/forms/d/e/Fictional_Form/viewform?usp=sharing",
    ),
  );
  const roundOne = createCollectionResponse(
    req,
    new Map([
      ["full_name", "Chen Example"],
      ["employment_status", "employed"],
    ]),
  );
  const path = join(folder, "round-one.json");
  await writeFile(path, "{");
  let inbox = new ResponseInbox(db, folder, 5);
  assert.deepEqual(await inbox.scan(100), []);
  await writeFile(path, JSON.stringify(roundOne));
  inbox = new ResponseInbox(anotherConnection, folder, 5);
  assert.deepEqual(await inbox.scan(120), []);
  assert.equal((await inbox.scan(130))[0].status, "accepted");
  assert.equal(findInstance(db.read(), first.id).state, "needs-attention");
  assert.equal(findInstance(db.read(), second.id).receipts.length, 0);
  const secondRequest = await db.update((state) =>
    requestQuestionnaire(state, first.id),
  );
  assert.deepEqual(
    new Set(secondRequest.questions.map(({ id }) => id)),
    new Set(["employer", "job_title", "comments"]),
  );
  const roundTwo = createCollectionResponse(
    secondRequest,
    new Map([
      ["employer", "Fictional Lab"],
      ["job_title", "软件架构师"],
      ["comments", "可以远程办公。"],
    ]),
  );
  const back = join(folder, "round-two.json");
  await writeFile(back, JSON.stringify(roundTwo));
  assert.equal((await importResponseFile(db, back)).status, "accepted");
  assert.equal((await importResponseFile(db, back)).status, "duplicate");
  const pending = findInstance(anotherConnection.read(), first.id);
  assert.equal(pending.state, "needs-attention");
  assert.equal(pending.record, undefined);
  assert.deepEqual(pending.issues, [
    { code: "verificationRequired", fields: ["job_title"] },
  ]);
  assert.equal(
    await db.update((state) =>
      verifyValue(state, first.id, "job_title", "Practice mismatch"),
    ),
    false,
  );
  assert.equal(
    await db.update((state) =>
      verifyValue(state, first.id, "job_title", "Software Architect"),
    ),
    true,
  );
  const ready = findInstance(anotherConnection.read(), first.id);
  assert.equal(ready.state, "queued");
  assert.deepEqual(ready.record?.verified, ["job_title"]);
  assert.equal(ready.record?.fields.comments, "Available to work remotely.");
  assert.deepEqual(ready.record?.history?.job_title.transformations, [
    { kind: "translation", from: "软件架构师", to: "Software Architect" },
  ]);
  assert.equal(ready.record?.history?.job_title.origin.source, "collection");
  assert.equal(await readFile(back, "utf8"), JSON.stringify(roundTwo));
});

test("quarantines malformed and unrecognized files and blocks without choosing a conflicting answer", async (t) => {
  const { folder, db } = await setup(t);
  const instance = await db.update((state) =>
    createInstance(state, workflow.id, undefined, initial),
  );
  const req = await db.update((state) =>
    requestQuestionnaire(state, instance.id),
  );
  const answerPath = join(folder, "answers.json");
  await writeFile(answerPath, "{ broken");
  assert.equal(
    (await importResponseFile(db, answerPath)).code,
    "invalidCollectionResponse",
  );
  const response = createCollectionResponse(
    req,
    new Map([["job_title", "软件架构师"]]),
  );
  const unrelated = { ...response, requestId: crypto.randomUUID() };
  await writeFile(answerPath, JSON.stringify(unrelated));
  assert.equal(
    (await importResponseFile(db, answerPath)).code,
    "collectionUnknown",
  );
  const { fields: _fields, ...required } = response;
  await writeFile(answerPath, JSON.stringify({ ...required, fields: {} }));
  assert.equal(
    (await importResponseFile(db, answerPath)).code,
    "collectionRequired",
  );
  await writeFile(answerPath, JSON.stringify(response));
  assert.equal((await importResponseFile(db, answerPath)).status, "accepted");
  const conflict = createCollectionResponse(
    req,
    new Map([["job_title", "Different answer"]]),
  );
  await writeFile(answerPath, JSON.stringify(conflict));
  assert.equal((await importResponseFile(db, answerPath)).status, "conflict");
  const awaiting = findInstance(db.read(), instance.id);
  assert.equal(awaiting.state, "needs-attention");
  assert.match(awaiting.form, /Software Architect/);
  assert.ok(awaiting.issues.some(({ code }) => code === "conflictingResponse"));
  await db.update((state) =>
    resolveResponse(state, instance.id, conflict.responseId, "keep"),
  );
  assert.equal(
    findInstance(db.read(), instance.id).receipts.at(-1)?.disposition,
    "kept",
  );
  await writeFile(
    answerPath,
    JSON.stringify({ ...conflict, fields: { job_title: "Changed duplicate" } }),
  );
  assert.equal(
    (await importResponseFile(db, answerPath)).code,
    "responseIdReused",
  );
});

test("defaults require explicit confirmation while allow-assumed remains available", async (t) => {
  const { db } = await setup(t);
  const updated = form.replace(
    '"type":"text","label":"姓名"',
    '"type":"text","label":"姓名","default":"Assumed Name"',
  );
  await db.update((state) => {
    registerWorkflow(state, { ...workflow, revision: "confirm" }, updated);
    registerWorkflow(
      state,
      {
        ...workflow,
        revision: "assume",
        policy: { ...workflow.policy, defaults: "allow-assumed" },
      },
      updated,
    );
  });
  const require = await db.update((state) =>
    createInstance(state, workflow.id, "confirm"),
  );
  const assume = await db.update((state) =>
    createInstance(state, workflow.id, "assume"),
  );
  assert.ok(require.issues[0].fields?.includes("full_name"));
  assert.ok(!assume.issues[0].fields?.includes("full_name"));
  const optedIn = await db.update((state) =>
    createInstance(
      state,
      workflow.id,
      "assume",
      '{"employment_status":"unemployed"}',
    ),
  );
  assert.equal(optedIn.record?.history?.full_name.origin.source, "default");
  await db.update((state) =>
    supplyValues(state, optedIn.id, '{"full_name":"Assumed Name"}'),
  );
  assert.equal(
    findInstance(db.read(), optedIn.id).record?.history?.full_name.origin
      .source,
    "manual",
  );
});

test("queue ownership prevents duplicate attempts and recovers interruption with explicit retry", async (t) => {
  const { db, connect } = await setup(t);
  const instance = await db.update((state) =>
    createInstance(state, workflow.id, undefined, initial),
  );
  await db.update((state) =>
    supplyValues(state, instance.id, '{"job_title":"软件架构师"}'),
  );
  await db.update((state) =>
    verifyValue(state, instance.id, "job_title", "Software Architect"),
  );
  await db.update((state) => {
    acquireWorker(state, "first", () => false);
    state.stopped = true;
    assert.equal(claimExecution(state, "first"), null);
    state.stopped = false;
    setPaused(state, workflow.id, true);
    assert.equal(claimExecution(state, "first"), null);
    setPaused(state, workflow.id, false);
  });
  const secondConnection = connect();
  const claims = await Promise.all(
    [db, secondConnection].map((connection) =>
      connection.update((state) => claimExecution(state, "first")),
    ),
  );
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(findInstance(db.read(), instance.id).state, "running");
  await assert.rejects(
    db.update((state) => acquireWorker(state, "second", () => true)),
    /workflowWorkerAlreadyRunning/,
  );
  await db.update((state) => acquireWorker(state, "second", () => false));
  const interrupted = findInstance(db.read(), instance.id);
  assert.equal(interrupted.state, "uncertain");
  assert.equal(
    interrupted.attempts.at(-1)?.issue?.code,
    "executionInterrupted",
  );
  await assert.rejects(
    db.update((state) => changeExecution(state, instance.id, "retry")),
    /workflowInvalidTransition/,
  );
  await db.update((state) =>
    changeExecution(state, instance.id, "retry", true),
  );
  const time = new Date().toISOString();
  const claim = await db.update((state) =>
    claimExecution(state, "second", time),
  );
  assert.ok(claim);
  await db.update((state) =>
    finishExecution(
      state,
      claim,
      {
        kind: "transient",
        issue: { code: "destinationBrowserUnavailable" },
      },
      time,
    ),
  );
  assert.equal(
    await db.update((state) => claimExecution(state, "second", time)),
    null,
  );
  assert.equal(
    findInstance(db.read(), instance.id).nextRun,
    new Date(Date.parse(time) + 5000).toISOString(),
  );
});

test("maps a nested reusable source without treating it as collection evidence", async (t) => {
  const { db } = await setup(t);
  const mapping = JSON.parse(
    await readFile(new URL("veradata-mapping.json", demo), "utf8"),
  );
  const mapped = readWorkflow(
    JSON.stringify({ ...workflow, revision: "mapped", sourceMapping: mapping }),
  );
  await db.update((state) => registerWorkflow(state, mapped, form));
  const source = JSON.stringify({
    records: [
      { kind: "contact", fields: { name: "Fictional Applicant" } },
      {
        kind: "employment",
        fields: { employer: "Example Workshop", endDate: "Present" },
      },
    ],
  });
  const instance = await db.update((state) =>
    createInstance(state, workflow.id, mapped.revision, source),
  );
  const request = await db.update((state) =>
    requestQuestionnaire(state, instance.id),
  );
  assert.deepEqual(
    request.questions.map(({ id }) => id),
    ["job_title", "comments"],
  );
  assert.doesNotMatch(
    JSON.stringify(request),
    /Fictional Applicant|Example Workshop/,
  );
  await db.update((state) =>
    supplyValues(state, instance.id, '{"job_title":"Example Role"}'),
  );
  await db.update((state) =>
    verifyValue(state, instance.id, "job_title", "Example Role"),
  );
  const validated = findInstance(db.read(), instance.id).record;
  assert.equal(validated?.history?.employment_status.origin.source, "mapped");
  assert.equal(validated?.fields.employment_status, "employed");
});
