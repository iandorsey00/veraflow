import { expect, test, type TestInfo } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCollectionResponse,
  type CollectionRequest,
} from "../../src/core/collection";
import { startDashboard } from "../../src/workflow/dashboard";
import { EmploymentDestination } from "../../src/workflow/destination";
import {
  claimExecution,
  createInstance,
  findInstance,
  registerWorkflow,
  supplyValues,
  verifyValue,
} from "../../src/workflow/engine";
import { readWorkflow } from "../../src/workflow/spec";
import { WorkflowDatabase } from "../../src/workflow/store";
import { WorkflowWorker } from "../../src/workflow/worker";

const demo = new URL("../../examples/source/collection/", import.meta.url);
const formFile = new URL("employment.vf", demo);
const specFile = new URL("employment-workflow.json5", demo);
const source = JSON.stringify({
  full_name: "Chen Example",
  employment_status: "employed",
  employer: "Fictional Lab",
});
const answers = new Map([
  ["job_title", "软件架构师"],
  ["comments", "可以远程办公。"],
]);

function exportedResponse(request: CollectionRequest) {
  const checkout = process.env.VERAFLOW_INTEGRATIONS_TEST_CHECKOUT;
  if (!checkout)
    return JSON.stringify(createCollectionResponse(request, answers));
  // Optional contract run through the separately maintained Apps Script adapter.
  const require = createRequire(import.meta.url);
  const { mockGoogle } = require(join(checkout, "tests/helpers/google.cjs"));
  const { adapter, world } = mockGoogle();
  const result = adapter.ingestRequest(JSON.stringify(request));
  const form = world.forms.get(result.formId);
  form.setPublished(true);
  const response = world.submit(
    form,
    request.questions.map(({ id }) => answers.get(id)),
  );
  adapter.onCollectionSubmit({ source: form, response, triggerUid: "1" });
  return world.exported()[0].content as string;
}

async function demoSetup(testInfo: TestInfo, fixtureHtml?: string) {
  const folder = await mkdtemp(join(tmpdir(), "veraflow-browser-workflow-"));
  const db = new WorkflowDatabase(folder);
  const adapter = new EmploymentDestination({ headless: true, fixtureHtml });
  const errors: string[] = [];
  const worker = new WorkflowWorker(
    db,
    folder,
    adapter,
    (code) => errors.push(code),
    150,
  );
  const workflow = readWorkflow(await readFile(specFile, "utf8"), true);
  const form = await readFile(formFile, "utf8");
  await worker.start();
  const dashboard = await startDashboard(db, worker, 0);
  const signal = new AbortController();
  await testInfo.attach("local-workflow-mode", {
    body: process.env.VERAFLOW_INTEGRATIONS_TEST_CHECKOUT
      ? "Apps Script adapter with mocked Google services"
      : "Native response fixture",
    contentType: "text/plain",
  });
  return {
    db,
    adapter,
    worker,
    dashboard,
    workflow,
    form,
    signal,
    folder,
    errors,
    async cleanup(run?: Promise<void>) {
      signal.abort();
      await run;
      await dashboard.close();
      await worker.close();
      db.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}

test("worker dashboard, inbox, verification and five-field readback leave the page for manual review", async ({
  page,
  request,
}, testInfo) => {
  const local = await demoSetup(testInfo);
  const { db, adapter, worker, dashboard, signal, folder, errors } = local;
  const run = worker.run(signal.signal);
  try {
    expect((await request.get(dashboard.origin + "/api/status")).status()).toBe(
      401,
    );
    const token = dashboard.accessUrl.split("#")[1];
    expect(
      (
        await request.post(dashboard.origin + "/api", {
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: "https://external.example",
          },
          data: { action: "stop", enabled: true },
        })
      ).status(),
    ).toBe(403);
    await page.goto(dashboard.accessUrl);
    await expect(
      page.getByText("Worker running on this computer.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add definition" }).click();
    await page.getByLabel("Workflow JSON or JSON5").setInputFiles({
      name: "employment-workflow.json5",
      mimeType: "text/plain",
      buffer: await readFile(specFile),
    });
    await page.getByLabel("Blank VeraFlow form").setInputFiles({
      name: "employment.vf",
      mimeType: "text/plain",
      buffer: await readFile(formFile),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "New instance" }).click();
    await page.getByLabel("Optional source JSON or JSON5").setInputFiles({
      name: "fictional.json",
      mimeType: "application/json",
      buffer: Buffer.from(source),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("button", { name: "Prepare questionnaire", exact: true })
      .click();
    const guidance = page.getByRole("dialog");
    await expect(
      guidance.getByText("Upload the request", { exact: false }),
    ).toBeVisible();
    await guidance.getByRole("button", { name: "Back" }).click();
    const { id, requests } = db.read().instances[0];
    await expect(
      page.getByText("Awaiting response", { exact: true }),
    ).toBeVisible();
    await writeFile(
      join(folder, "provider-response.json"),
      exportedResponse(requests[0].request),
    );
    await expect
      .poll(() => findInstance(db.read(), id).issues.map(({ code }) => code))
      .toEqual(["verificationRequired"]);
    expect(findInstance(db.read(), id).attempts).toHaveLength(0);
    await page.getByRole("button", { name: "Verify field" }).click();
    await page
      .getByLabel("Enter the value from an independent source")
      .fill("Software Architect");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect
      .poll(() => findInstance(db.read(), id).state)
      .toBe("autofilled");
    const review = await adapter.reviewPage(id);
    expect(review).toBeTruthy();
    await expect(review!.getByLabel("Full name", { exact: true })).toHaveValue(
      "Chen Example",
    );
    await expect(review!.getByLabel("Employment", { exact: true })).toHaveValue(
      "employed",
    );
    await expect(review!.getByLabel("Employer", { exact: true })).toHaveValue(
      "Fictional Lab",
    );
    await expect(review!.getByLabel("Job title", { exact: true })).toHaveValue(
      "Software Architect",
    );
    await expect(review!.getByLabel("Comments", { exact: true })).toHaveValue(
      "Available to work remotely.",
    );
    await expect(review!.locator("#submission")).toBeEmpty();
    expect(findInstance(db.read(), id).attempts.at(-1)?.report).toEqual({
      checked: [
        "full_name",
        "employment_status",
        "employer",
        "job_title",
        "comments",
      ],
      mismatches: [],
    });
    await page.getByRole("button", { name: "简体中文" }).click();
    await expect(
      page.getByText("已填写 · 请在浏览器复核", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await local.cleanup(run);
  }
});

test("browser preflight and readback report page changes and altered values", async ({}, testInfo) => {
  const html = await readFile(new URL("destination.html", demo), "utf8");
  for (const mismatch of [false, true]) {
    const fixture = mismatch
      ? html.replace(
          'const form = document.getElementById("intake");',
          `
        const form = document.getElementById("intake");
        form.elements.name.addEventListener("input", (event) => { event.target.value = "Altered"; });
      `,
        )
      : html.replace(
          "<h1>Fictional employment intake</h1>",
          "<h1>Changed page</h1>",
        );
    const local = await demoSetup(testInfo, fixture);
    try {
      const { db, adapter, workflow, form } = local;
      await db.update((state) => registerWorkflow(state, workflow, form));
      const path = await db.update(async (state) => {
        const instance = await createInstance(
          state,
          workflow.id,
          undefined,
          source,
        );
        await supplyValues(state, instance.id, '{"job_title":"软件架构师"}');
        await verifyValue(
          state,
          instance.id,
          "job_title",
          "Software Architect",
        );
        return claimExecution(state, state.worker!.id)!;
      });
      const outcome = await adapter.execute(
        path,
        () => true,
        new AbortController().signal,
      );
      expect(outcome).toMatchObject({
        kind: mismatch ? "uncertain" : "failed",
        issue: {
          code: mismatch
            ? "destinationReadbackMismatch"
            : "destinationPageChanged",
        },
        ...(mismatch ? { report: { mismatches: ["full_name"] } } : {}),
      });
      if (mismatch)
        await expect(
          (await adapter.reviewPage(path.instanceId))!.locator("#submission"),
        ).toBeEmpty();
    } finally {
      await local.cleanup();
    }
  }
});
