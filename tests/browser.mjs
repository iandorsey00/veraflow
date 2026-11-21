import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, webkit } from "playwright";
import { example, expected, inputs, script } from "./fixtures.mjs";

const engine = process.env.VERAFLOW_BROWSER ?? "chromium";
const launch = () =>
  engine === "webkit"
    ? webkit.launch()
    : chromium.launch(engine === "edge" ? { channel: "msedge" } : {});

test("moved and renamed form, offline entry, verification and blocked clipboard recovery", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-browser-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = join(directory, "original.html");
  execFileSync(process.execPath, [
    fileURLToPath(script),
    fileURLToPath(example),
    original,
  ]);
  const renamed = join(directory, "renamed.html");
  await rename(original, renamed);
  const browser = await launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Blocked", "NotAllowedError")),
      },
    });
  });
  const requests = [];
  const errors = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(renamed).href);
  assert.equal(
    await page.getByRole("heading", { name: "Service shipment" }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Needs attention" }).count(),
    1,
  );
  await page.getByRole("button", { name: "Create output" }).click();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    await page.getByLabel("Case number").getAttribute("id"),
  );
  assert.match(
    await page
      .getByLabel("Tracking number", { exact: true })
      .getAttribute("aria-describedby"),
    /-help/,
  );
  assert.equal(await page.getByLabel("Airport code").isVisible(), false);
  assert.equal(await page.getByLabel("Internal note").isVisible(), false);

  await page.getByLabel("Case number").fill(inputs.case);
  const tracking = page.getByLabel("Tracking number", { exact: true });
  await tracking.fill(inputs.tracking);
  await page.getByLabel("Customer", { exact: true }).fill(inputs.customer);
  await page.getByRole("link", { name: "Verify Tracking number" }).click();
  const candidate = page.getByLabel("Independent value for Tracking number");
  await candidate.fill("ZX 902 71");
  await candidate.press("Enter");
  assert.equal(await tracking.inputValue(), inputs.tracking);
  assert.equal(
    await page
      .getByText("Values differ. Your original entry is unchanged.")
      .isVisible(),
    true,
  );
  await candidate.fill("ZX  902 17");
  await candidate.press("Enter");
  assert.equal(
    await page.getByText("Verified.", { exact: true }).isVisible(),
    true,
  );
  await page.getByText("Preview output", { exact: true }).click();
  assert.equal(
    await page.locator(".output-preview pre").nth(0).textContent(),
    expected.subject,
  );
  assert.equal(
    await page.locator(".output-preview pre").nth(1).textContent(),
    expected.body,
  );
  await page.getByRole("button", { name: "简体中文" }).click();
  assert.equal(await tracking.inputValue(), inputs.tracking);
  assert.equal(
    await page.getByText("已核对。", { exact: true }).isVisible(),
    true,
  );
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "Create output" }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Subject" }).inputValue(),
    expected.subject,
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Body" }).inputValue(),
    expected.body,
  );

  await page.getByRole("button", { name: "Copy entire output" }).click();
  await page.getByText(/Clipboard access is blocked/).waitFor();
  const entire = page.getByRole("textbox", { name: "Entire output" });
  const full = `${expected.subject}\n\n${expected.body}`;
  assert.equal(await entire.inputValue(), full);
  assert.deepEqual(
    await entire.evaluate((area) => [area.selectionStart, area.selectionEnd]),
    [0, full.length],
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text" }).click();
  assert.equal(await readFile(await (await downloading).path(), "utf8"), full);

  await page.getByLabel("Output", { exact: true }).selectOption("ticket");
  await page.getByRole("button", { name: "Create output" }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Note", exact: true }).inputValue(),
    expected.note,
  );
  await page.getByLabel("Route").selectOption("air");
  await page.getByRole("link", { name: "Enter Airport code" }).click();
  await page.getByLabel("Airport code").fill("LAX");
  await tracking.fill("ZX 902 18");
  assert.equal(
    await page
      .getByRole("link", { name: "Verify Tracking number" })
      .isVisible(),
    true,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Ticket note" }).isVisible(),
    false,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});

test("the authoring page exposes a newer deployed version and downloads an HTML form", async (t) => {
  let offered = "0.0.1";
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("https://veraflow.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/version.json") {
      await route.fulfill({ json: { version: offered } });
      return;
    }
    const name = path === "/" ? "index.html" : path.slice(1);
    await route.fulfill({ path: join("dist", name) });
  });
  await page.goto("https://veraflow.test/");
  const update = page.getByRole("link", { name: "Update now…" });
  assert.equal(await update.isVisible(), false);
  offered = "10.2.0";
  await page.reload();
  await update.waitFor();
  assert.match(await update.getAttribute("href"), /\?v=10\.2\.0$/);
  await page
    .getByLabel("VeraFlow template")
    .setInputFiles(fileURLToPath(example));
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML form" }).click();
  assert.equal((await downloading).suggestedFilename(), "service-case.html");
});
