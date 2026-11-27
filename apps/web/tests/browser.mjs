import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, webkit } from "playwright";
import {
  example,
  expected,
  inputs,
  script,
  shipment,
  shipmentExample,
  housingExample,
  housingResponse,
  embeddedTemplate,
  serviceExample,
  serviceFile,
} from "./fixtures.mjs";

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
  await page.getByText("Missing values: 3", { exact: true }).waitFor();
  await page.getByText("Pending checks: 0", { exact: true }).waitFor();
  assert.equal(
    await page.locator("#field-checks").evaluate((checks) =>
      checks.nextElementSibling?.matches("#record-fields"),
    ),
    true,
  );
  await page.getByRole("button", { name: "Create output" }).click();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    await page.getByLabel("Case number", { exact: true }).getAttribute("id"),
  );
  assert.match(
    await page
      .getByLabel("Tracking number", { exact: true })
      .getAttribute("aria-describedby"),
    /-help/,
  );
  const airport = page.getByLabel("Airport code", { exact: true });
  assert.equal(await airport.isVisible(), false);
  assert.equal(
    await page.getByLabel("Internal note", { exact: true }).isVisible(),
    false,
  );

  await page.getByLabel("Case number", { exact: true }).fill(inputs.case);
  const tracking = page.getByLabel("Tracking number", { exact: true });
  await tracking.fill(inputs.tracking);
  await page.getByLabel("Customer", { exact: true }).fill(inputs.customer);
  await page.getByText("Missing values: 0", { exact: true }).waitFor();
  await page.getByText("Pending checks: 1", { exact: true }).waitFor();
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
  const plainText = await downloading;
  assert.equal(plainText.suggestedFilename(), "email.txt");
  assert.equal(await readFile(await plainText.path(), "utf8"), full);
  await page
    .getByRole("checkbox", { name: "Add a timestamp to the filename" })
    .check();
  const downloadingAgain = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text" }).click();
  assert.match(
    (await downloadingAgain).suggestedFilename(),
    /^email-\d{4}-\d{2}-\d{2}_.*Z\.txt$/,
  );

  await page.getByLabel("Output", { exact: true }).selectOption("ticket");
  await page.getByRole("button", { name: "Create output" }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Note", exact: true }).inputValue(),
    expected.note,
  );
  await page.getByLabel("Route", { exact: true }).selectOption("air");
  await page.getByRole("link", { name: "Enter Airport code" }).click();
  await airport.fill("LAX");
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
  const update = page.getByRole("link", { name: "Update app…" });
  assert.equal(await update.isVisible(), false);
  offered = "10.2.0";
  await page.reload();
  await update.waitFor();
  assert.match(await update.getAttribute("href"), /\?v=10\.2\.0$/);
  await page
    .locator("#source")
    .setInputFiles(fileURLToPath(example));
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML form" }).click();
  assert.equal((await downloading).suggestedFilename(), "service-case.html");
  await page.getByText("Form tools", { exact: true }).press("Enter");
  await page
    .getByRole("checkbox", { name: "Add a timestamp to the filename" })
    .check();
  assert.match(
    await page.locator("#export-filename").textContent(),
    /^service-case-\d{4}-\d{2}-\d{2}_.*Z\.html$/,
  );
  const downloadingAgain = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML form" }).click();
  assert.equal(
    (await downloadingAgain).suggestedFilename(),
    await page.locator("#export-filename").textContent(),
  );

});

test("offline shipment steps preserve later inputs and require recopy after a revision", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-shipment-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "shipment.html");
  execFileSync(process.execPath, [
    fileURLToPath(script),
    fileURLToPath(shipmentExample),
    file,
  ]);
  const browser = await launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        async writeText(text) {
          if (window.blockVeraFlowClipboard)
            throw new Error("Clipboard blocked");
          window.lastVeraFlowCopy = text;
        },
      },
    });
  });
  const requests = [];
  const errors = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(file).href);
  const create = page.getByRole("button", { name: "Create output" });
  const next = page.getByRole("button", { name: "Next step" });
  const previous = page.getByRole("button", { name: "Previous step" });
  const reference = page.getByLabel("Reference", { exact: true });
  const tracking = page.getByLabel("Tracking", { exact: true });
  const warnings = page.locator(".step-warnings");
  const stepTitle = () => page.locator(".step-heading h2").textContent();
  const { firstReference, newReference, recipient, tracking: code } = shipment;
  const dispatchWarning = warnings.getByText(
    /Prepare shipment · Inputs changed after copying/,
  );

  assert.equal(await stepTitle(), "Prepare shipment");
  assert.equal(await tracking.isVisible(), false);
  assert.equal(await next.isVisible(), false);
  assert.match(await reference.getAttribute("aria-describedby"), /-help/);
  assert.match(
    await page.locator("#form > header").textContent(),
    /Use the dispatch record/,
  );
  assert.equal(
    await page.locator("#output-instructions").textContent(),
    "Paste the subject and message into the dispatch email.",
  );
  await reference.fill(firstReference);
  await page.getByLabel("Recipient", { exact: true }).fill(recipient);
  await create.press("Enter");
  await page.keyboard.press("Enter");
  const independent = page.getByLabel("Independent value for Reference");
  assert.equal(
    await independent.evaluate((input) => input === document.activeElement),
    true,
  );
  await independent.fill("VF-999");
  await independent.press("Enter");
  assert.equal(await reference.inputValue(), firstReference);
  await independent.fill(firstReference);
  await independent.press("Enter");
  await create.click();
  await page.getByRole("button", { name: "Copy entire output" }).click();
  await page.getByText("Copied.", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.lastVeraFlowCopy),
    "Shipment VF-104\nHello Alex, shipment VF-104 is ready for pickup.",
  );
  assert.equal(await stepTitle(), "Prepare shipment");

  await next.click();
  assert.equal(await stepTitle(), "Record pickup");
  assert.equal(await reference.isVisible(), false);
  await page.getByText("Fields from earlier steps", { exact: true }).click();
  assert.match(
    await page.locator(".earlier-fields").textContent(),
    /VF-104 · Verified\./,
  );
  await tracking.fill(code);
  await create.click();
  const note = page.getByRole("textbox", { name: "Body" });
  assert.equal(
    await note.inputValue(),
    "Shipment VF-104 picked up. Tracking: PK-12.",
  );
  await previous.click();
  await reference.fill(newReference);
  await dispatchWarning.waitFor();
  assert.equal(
    await warnings.getByText(/Record pickup · Inputs changed/).isVisible(),
    true,
  );
  assert.equal(
    await page.getByRole("link", { name: "Verify Reference" }).isVisible(),
    true,
  );
  await page.getByRole("link", { name: "Verify Reference" }).click();
  await independent.fill(newReference);
  await independent.press("Enter");
  await create.click();
  assert.equal(
    await page.getByRole("textbox", { name: "Subject" }).inputValue(),
    "Shipment VF-105",
  );
  assert.equal(await dispatchWarning.isVisible(), true);

  await page.getByRole("button", { name: "Copy: Subject" }).click();
  await page.getByText("Copied.", { exact: true }).waitFor();
  assert.equal(await dispatchWarning.isVisible(), true);
  await page.evaluate(() => {
    window.blockVeraFlowClipboard = true;
  });
  await page.getByRole("button", { name: "Copy: Message" }).click();
  await page.getByText(/Clipboard access is blocked/).waitFor();
  assert.equal(await dispatchWarning.isVisible(), true);
  const message = page.getByRole("textbox", { name: "Message" });
  const selected = await message.evaluate((area) =>
    area.value.slice(area.selectionStart, area.selectionEnd),
  );
  assert.equal(selected, "Hello Alex, shipment VF-105 is ready for pickup.");
  await page.keyboard.press("ControlOrMeta+c");
  await dispatchWarning.waitFor({ state: "hidden" });

  await next.click();
  assert.equal(await tracking.inputValue(), code);
  await create.click();
  assert.equal(
    await note.inputValue(),
    "Shipment VF-105 picked up. Tracking: PK-12.",
  );
  assert.equal(await warnings.isVisible(), false);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});

test("prefilled housing export runs offline and downloads reviewable response JSON", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-housing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = join(directory, "housing.html");
  execFileSync(process.execPath, [
    fileURLToPath(script),
    "--responses",
    fileURLToPath(housingResponse),
    fileURLToPath(housingExample),
    original,
  ]);
  await mkdir(join(directory, "moved"));
  const renamed = join(directory, "moved", "housing-review.html");
  await rename(original, renamed);
  const browser = await launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    offline: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        async writeText() {
          throw new Error("Clipboard blocked");
        },
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

  const candidate = page.getByRole("textbox", {
    name: /Independent value for Legal name/,
  });
  const name = page.getByRole("textbox", {
    name: "Legal name / 法定姓名",
    exact: true,
  });
  const next = page.getByRole("button", { name: "Next step" });
  const prepareAll = page.getByRole("button", {
    name: "Prepare all step outputs",
  });
  assert.equal(await name.inputValue(), "Drew Example");
  assert.equal(
    await page.getByRole("button", { name: "Create output" }).isVisible(),
    false,
  );
  await next.press("Enter");
  await page.keyboard.press("Enter");
  assert.ok(
    await candidate.evaluate((input) => input === document.activeElement),
  );
  await candidate.fill("Other Name");
  await candidate.press("Enter");
  assert.equal(await name.inputValue(), "Drew Example");
  await candidate.fill("Drew Example");
  await candidate.press("Enter");
  await next.click();

  assert.equal(await page.getByLabel("Output", { exact: true }).inputValue(), "review");

  await page.getByText("Optional fields", { exact: true }).click();
  const reason = page.getByRole("textbox", {
    name: "English wording / 英文表述",
  });
  const english = "My current home is too far from work.";
  await reason.fill(english);
  await prepareAll.click();
  const application = page.locator(".prepared-output").filter({
    has: page.getByRole("heading", { name: "English application" }),
  });
  const review = page
    .locator(".prepared-output")
    .filter({ has: page.getByRole("heading", { name: "中文核对" }) });
  const englishText = `Name: Drew Example\nEmployment: Employed\nReason for moving: ${english}`;
  assert.equal(
    await application.getByRole("textbox", { name: "Body" }).inputValue(),
    englishText,
  );
  assert.equal(
    await review.getByRole("textbox", { name: "Body" }).inputValue(),
    "姓名：Drew Example\n就业状态：在职\n搬家原因：现在的住处离公司太远。",
  );
  assert.equal(
    await review.getByText("请核对姓名、就业状态及原文。").isVisible(),
    true,
  );
  const outputDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download output JSON" }).click();
  const output = await outputDownload;
  assert.equal(output.suggestedFilename(), "outputs.json");
  assert.deepEqual(JSON.parse(await readFile(await output.path(), "utf8")), {
    format: "veraflow-render",
    version: 1,
    outputs: [
      {
        id: "application",
        label: "English application",
        sections: [{ id: "body", label: "Body", text: englishText }],
      },
      {
        id: "review",
        label: "中文核对",
        sections: [{
          id: "body",
          label: "Body",
          text: "姓名：Drew Example\n就业状态：在职\n搬家原因：现在的住处离公司太远。",
        }],
      },
    ],
  });
  await page.getByRole("button", { name: "简体中文" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.getByText("表单工具", { exact: true }).waitFor();
  await page.getByRole("button", { name: "English" }).click();
  await application.getByRole("button", { name: "Copy entire output" }).click();
  await page.getByText(/Clipboard access is blocked/).waitFor();
  assert.equal(
    await application
      .getByRole("textbox", { name: "Entire output" })
      .evaluate((area) =>
        area.value.slice(area.selectionStart, area.selectionEnd),
      ),
    englishText,
  );
  await page.keyboard.press("ControlOrMeta+c");
  await page.getByRole("button", { name: "Previous step" }).click();
  await name.fill("Alex Example");
  const warnings = page.locator(".step-warnings");
  assert.match(
    await warnings.textContent(),
    /English application · Inputs changed/,
  );
  assert.match(await warnings.textContent(), /中文核对 · Inputs changed/);
  await page.getByText("Form tools", { exact: true }).press("Enter");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download response JSON" }).click();
  const downloaded = await downloading;
  assert.equal(downloaded.suggestedFilename(), "responses.json");
  assert.deepEqual(
    JSON.parse(await readFile(await downloaded.path(), "utf8")),
    {
      legal_name: "Alex Example",
      employment: "employed",
      moving_reason: "现在的住处离公司太远。",
      reason_en: english,
    },
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});

test("offline bulk extraction applies only reviewed values and exports a flat record", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-extraction-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, "intake.html");
  execFileSync(process.execPath, [
    fileURLToPath(script),
    fileURLToPath(serviceExample),
    target,
  ]);
  const browser = await launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    offline: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        async readText() {
          throw new Error("Blocked");
        },
        async writeText() {
          throw new Error("Blocked");
        },
      },
    });
  });
  await page.goto(pathToFileURL(target).href);
  const extract = page.getByRole("button", { name: "Extract from source…" });
  const source = page.getByRole("textbox", { name: "Source text" });
  const acquisition = page.getByRole("dialog", {
    name: "Extract from source…",
  });
  const review = page.getByRole("dialog", { name: "Review candidates" });
  const serial = review.getByRole("group", {
    name: "Serial number",
    exact: true,
  });
  const quantity = review.getByRole("group", {
    name: "Affected units",
    exact: true,
  });
  const serialCheck = serial.getByRole("checkbox");
  const apply = review.getByRole("button", { name: "Apply selected values" });
  const record = page.getByRole("textbox", {
    name: "Serial number",
    exact: true,
  });
  await extract.press("Enter");
  assert.ok(await source.evaluate((input) => input === document.activeElement));
  await acquisition.getByRole("button", { name: "Read clipboard" }).click();
  await acquisition.getByText(/Clipboard access failed/).waitFor();
  await page
    .locator("#extract-file")
    .setInputFiles(fileURLToPath(serviceFile("service-intake-source.txt")));
  await acquisition.getByRole("button", { name: "Find candidates" }).click();
  assert.equal(await serialCheck.isChecked(), false);
  assert.match(
    await review.getByRole("heading", { level: 3 }).first().textContent(),
    /Needs a decision/,
  );
  assert.equal(await quantity.getByRole("checkbox").isChecked(), true);
  assert.equal(await serial.getByText("序列号：ABC123458").isVisible(), true);
  await serial.getByRole("combobox").selectOption({ label: "ABC123458" });
  assert.equal(await serialCheck.isChecked(), false);
  await serialCheck.check();
  const candidateDownload = page.waitForEvent("download");
  await review.getByRole("button", { name: "Save candidates…" }).click();
  assert.equal(
    JSON.parse(await readFile(await (await candidateDownload).path(), "utf8"))
      .format,
    "veraflow-candidates",
  );
  await apply.click();
  assert.equal(await record.inputValue(), "ABC123458");

  async function importCandidates(textName, fileName) {
    const tools = page.locator("#form-tools");
    if ((await tools.getAttribute("open")) === null)
      await tools.getByText("Form tools", { exact: true }).press("Enter");
    await tools
      .getByRole("button", { name: "External extraction files" })
      .click();
    await source.fill(await readFile(serviceFile(textName), "utf8"));
    await page
      .locator("#candidate-file")
      .setInputFiles(fileURLToPath(serviceFile(fileName)));
    await review.waitFor();
  }
  await importCandidates(
    "service-intake-email.txt",
    "service-email-candidates.json",
  );
  await review.getByText(/Matches current values/).press("Enter");
  assert.equal(
    await quantity
      .getByRole("textbox", { name: "Proposed value" })
      .inputValue(),
    "1",
  );
  await review.getByText(/No candidate/).click();
  assert.equal(
    await review.getByText("Shipping address", { exact: true }).isVisible(),
    true,
  );
  assert.equal(await serialCheck.isChecked(), false);
  await serialCheck.check();
  await apply.click();
  assert.equal(await record.inputValue(), "ABC123456");

  await importCandidates(
    "service-intake-call.txt",
    "service-call-candidates.json",
  );
  await serialCheck.check();
  await apply.click();
  assert.equal(await record.inputValue(), "ABC123458");
  await page
    .getByRole("button", { name: "Verify field: Serial number" })
    .click();
  const independent = page.getByRole("textbox", {
    name: /Independent value for Serial number/,
  });
  await independent.fill("ABC123458");
  await independent.press("Enter");
  await page.getByRole("button", { name: "Create output" }).click();
  assert.match(
    await page.getByRole("textbox", { name: "Body", exact: true }).inputValue(),
    /V6530 · 1 affected · serial ABC123458/,
  );
  await page.getByRole("button", { name: "Copy entire output" }).click();
  await page.getByText(/Clipboard access is blocked/).waitFor();
  assert.match(
    await page
      .getByRole("textbox", { name: "Entire output" })
      .evaluate((area) =>
        area.value.slice(area.selectionStart, area.selectionEnd),
      ),
    /serial ABC123458/,
  );
  await importCandidates(
    "service-intake-call.txt",
    "service-call-candidates.json",
  );
  const matches = review.getByText(/Matches current values/);
  assert.equal(await serial.isVisible(), false);
  await matches.press("Enter");
  assert.equal(await serial.isVisible(), true);
  await serialCheck.check();
  await apply.click();
  assert.equal(await record.inputValue(), "ABC123458");
  await page.getByText("Verified.", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Contact name", exact: true }).inputValue(),
    "Sarah Example",
  );
  await record.fill("ABC123459");
  await page.getByText("Pending checks: 1", { exact: true }).waitFor();
  await record.fill("ABC123458");
  await page.getByText("Pending checks: 1", { exact: true }).waitFor();
  const responseDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download response JSON" }).click();
  const data = JSON.parse(
    await readFile(await (await responseDownload).path(), "utf8"),
  );
  assert.equal(data.serial_number, "ABC123458");
  assert.equal(data.quantity_affected, "1");
  assert.equal(Object.hasOwn(data, "shipping_address"), false);
  assert.equal(Object.hasOwn(data, "candidates"), false);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});

test("dispatch JSON creates output and merges reviewed values in a file opened offline", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-json-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const dispatchFile = fileURLToPath(new URL("../examples/dispatch-record.json5", import.meta.url));
  const formFile = fileURLToPath(new URL("../examples/dispatch-form.vf", import.meta.url));
  const dispatch = await readFile(dispatchFile, "utf8");
  await page.route("https://veraflow.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ path: join("dist", path === "/" ? "index.html" : path.slice(1)) });
  });
  await page.goto("https://veraflow.test/");
  const open = page.getByRole("button", { name: "Open JSON / JSON5…" });
  const dialog = page.getByRole("dialog");
  const review = dialog.getByRole("button", { name: "Review data" });
  const openFilled = dialog.getByRole("button", { name: "Open filled form" });
  const form = page.frameLocator("#record-form");
  const input = dialog.getByLabel("Paste JSON or JSON5");

  await open.press("Enter");
  assert.equal(await input.evaluate((control) => control === document.activeElement), true);
  await dialog.locator('input[accept=".json,.json5"]').setInputFiles(dispatchFile);
  await review.press("Enter");
  await dialog.getByRole("cell", { name: "000184", exact: true }).waitFor();
  await dialog.getByRole("cell", { name: "Unanswered", exact: true }).waitFor();
  await openFilled.press("Enter");
  await form.locator(".output-preview pre").filter({ hasText: "Ask for a receipt." }).waitFor();
  assert.match(await form.locator(".output-preview pre").textContent(), /reference: 000184/);

  await open.click();
  for (const [malformed, error] of [
    ["{reference: 'first', reference: 'second'}", /reference occurs more than once/],
    ["{notes: ['nested']}", /notes contains an object or array/],
    ["{packages: NaN}", /packages needs a finite number/],
  ]) {
    await input.fill(malformed);
    await review.click();
    await dialog.getByRole("alert").getByText(error).waitFor();
  }
  const precise = "9007199254740993.23000000001";
  const literal = "<b>{{reference}}</b>";
  await input.fill(dispatch.replace("packages: 3", `packages: ${precise}`).replace("tracking: null,", "tracking: null, delivery_code: '', extra: '" + literal + "',"));
  await review.click();
  await dialog.getByRole("cell", { name: "Explicitly empty", exact: true }).waitFor();
  await dialog.getByLabel("Use data for").selectOption("custom");
  await dialog.getByLabel("Output text").fill("Dispatch {{reference}} to {{destination}} for {{contact}}.\nPackages: {{packages}}\n{{extra}}");
  await openFilled.click();
  const customPreview = form.locator(".output-preview pre");
  const customText = `Dispatch 000184 to North Depot for 林晓 / Alex Lin.\nPackages: ${precise}\n${literal}`;
  await customPreview.filter({ hasText: literal }).waitFor();
  assert.equal(await customPreview.textContent(), customText);
  assert.equal(await customPreview.locator("b").count(), 0);

  await open.click();
  await input.fill(dispatch.replace("tracking: null,", "tracking: null, delivery_code: '',"));
  await review.click();
  await dialog.getByLabel("Use data for").selectOption("reusable");
  await dialog.getByLabel("Reusable form file").setInputFiles(formFile);
  await dialog.getByRole("cell", { name: "East Depot", exact: true }).waitFor();
  await dialog.getByRole("cell", { name: "North Depot", exact: true }).waitFor();
  await openFilled.click();
  const htmlDownload = page.waitForEvent("download");
  await page.locator("#download-record-form").click();
  const localHtml = join(directory, "renamed-dispatch.html");
  await (await htmlDownload).saveAs(localHtml);

  const context = await browser.newContext({ offline: true });
  const offline = await context.newPage();
  await offline.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText(value) {
          if (window.blockCopy) return Promise.reject(new Error("Blocked"));
          window.copiedValue = value;
          return Promise.resolve();
        },
      },
    });
  });
  const requests = [];
  const errors = [];
  offline.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  offline.on("pageerror", (error) => errors.push(error.message));
  await offline.goto(pathToFileURL(localHtml).href);
  const tools = offline.locator("#form-tools > summary");
  const status = (label) => offline.getByLabel(label, { exact: true }).evaluate(
    (control) => document.getElementById(control.id + "-status").textContent,
  );
  async function verify(label, value) {
    await offline.getByRole("button", { name: `Verify field: ${label}` }).click();
    const entry = offline.getByLabel(`Independent value for ${label}`, { exact: true });
    await entry.fill(value);
    await entry.press("Enter");
    assert.equal(await status(label), "Verified.");
  }

  await verify("Reference", "000184");
  await verify("Destination", "North Depot");
  await offline.locator(".output-preview pre").filter({ hasText: "Dispatch 000184" }).waitFor();
  await tools.press("Enter");
  await offline.getByRole("button", { name: "Open JSON / JSON5…" }).press("Enter");
  const offlineDialog = offline.getByRole("dialog", { name: "Open JSON / JSON5…" });
  await offlineDialog.getByLabel("Paste JSON or JSON5").fill('{reference: "000184", destination: "South Depot"}');
  await offlineDialog.getByRole("button", { name: "Review data" }).press("Enter");
  const merge = offline.getByRole("dialog", { name: "Review JSON data" });
  await merge.getByRole("cell", { name: "South Depot", exact: true }).waitFor();
  assert.equal(await offline.getByLabel("Destination", { exact: true }).inputValue(), "North Depot");
  await merge.getByRole("button", { name: "Apply reviewed values" }).press("Enter");
  assert.equal(await status("Reference"), "Verified.");
  assert.equal(await status("Destination"), "Verification required.");
  assert.equal(await offline.getByLabel("Notes", { exact: true }).inputValue(), "Leave at the front desk.\nAsk for a receipt.");
  await verify("Destination", "South Depot");
  await offline.getByRole("button", { name: "Create output", exact: true }).click();
  const full = offline.getByRole("button", { name: "Copy entire output" });
  await full.click();
  await offline.getByText("Copied.", { exact: true }).waitFor();
  assert.match(await offline.evaluate(() => window.copiedValue), /Dispatch 000184 to South Depot/);
  await offline.evaluate(() => { window.blockCopy = true; });
  await full.click();
  await offline.getByText(/Clipboard access is blocked/).waitFor();
  const selected = await offline.locator("textarea:focus").evaluate(
    (control) => control.value.slice(control.selectionStart, control.selectionEnd),
  );
  assert.match(selected, /Leave at the front desk\.\nAsk for a receipt\./);

  const recordDownload = offline.waitForEvent("download");
  await offline.getByRole("button", { name: "Download response JSON" }).click();
  const saved = await readFile(await (await recordDownload).path(), "utf8");
  assert.deepEqual(JSON.parse(saved), {
    reference: "000184",
    contact: "林晓 / Alex Lin",
    destination: "South Depot",
    packages: "3",
    priority: "true",
    notes: "Leave at the front desk.\nAsk for a receipt.",
    tracking: null,
    delivery_code: "",
  });
  await open.click();
  await input.fill(saved);
  await review.click();
  await dialog.getByRole("cell", { name: "South Depot", exact: true }).waitFor();
  await dialog.getByRole("cell", { name: "Unanswered", exact: true }).waitFor();
  await dialog.getByRole("cell", { name: "Explicitly empty", exact: true }).waitFor();
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});

test("offline default output, reviewed JSON, and versioned output downloads agree", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-output-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const form = fileURLToPath(new URL("../examples/dispatch-exchange.vf", import.meta.url));
  const record = join(directory, "record.json");
  const html = join(directory, "dispatch.html");
  const accepted = {
    reference: "000184",
    route: "ground",
    tracking: null,
    delivery_code: "",
  };
  await writeFile(record, JSON.stringify(accepted));
  execFileSync(process.execPath, [
    fileURLToPath(script), "--responses", record, form, html,
  ]);
  const browser = await launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await page.goto(pathToFileURL(html).href);

  const picker = page.getByLabel("Output", { exact: true });
  const create = page.getByRole("button", { name: "Create output", exact: true });
  const downloadOutput = page.getByRole("button", { name: "Download output JSON" });
  async function downloadJson(button) {
    const pending = page.waitForEvent("download");
    await button.click();
    const file = await pending;
    return JSON.parse(await readFile(await file.path(), "utf8"));
  }

  assert.equal(await picker.inputValue(), "log");
  await page.getByText("Preview output", { exact: true }).click();
  const logText = "000184 | Ground service | Tracking:  | Delivery code: ";
  assert.equal(await page.locator(".output-preview pre").textContent(), logText);
  await create.click();
  const downloadedLog = await downloadJson(downloadOutput);
  assert.deepEqual(downloadedLog, {
    format: "veraflow-render",
    version: 1,
    outputs: [{
      id: "log",
      label: "Dispatch log",
      sections: [{ id: "body", label: "Log entry", text: logText }],
    }],
  });
  if (process.env.VERAFLOW_DESKTOP_DIR) {
    const cli = join(process.env.VERAFLOW_DESKTOP_DIR, "scripts", "veraflow");
    const rendered = execFileSync(process.execPath, [
      cli, "render", record, form, "--format", "json",
    ], { encoding: "utf8" });
    assert.deepEqual(downloadedLog, JSON.parse(rendered));
  }

  await picker.selectOption("note");
  await create.click();
  const downloadedNote = await downloadJson(downloadOutput);
  assert.deepEqual(downloadedNote.outputs[0].sections, [
    { id: "subject", label: "Subject", text: "Dispatch 000184" },
    { id: "body", label: "Body", text: "Route: Ground service\nTracking: \nDelivery code: " },
  ]);
  await page.getByLabel("Reference", { exact: true }).fill("000185");
  assert.equal(await picker.inputValue(), "note");
  assert.equal(await downloadOutput.count(), 0);
  await page.locator("#form-tools > summary").click();
  await page.getByRole("button", { name: "Open JSON / JSON5…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paste JSON or JSON5").fill('{reference: "000184"}');
  await dialog.getByRole("button", { name: "Review data" }).click();
  await dialog.getByRole("cell", { name: "000185", exact: true }).waitFor();
  await dialog.getByRole("cell", { name: "000184", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Apply reviewed values" }).click();
  assert.equal(await picker.inputValue(), "note");
  assert.deepEqual(
    await downloadJson(page.getByRole("button", { name: "Download response JSON" })),
    accepted,
  );
  assert.deepEqual(requests, []);
});

test("collection questionnaire opens from disk and downloads the same response on retry", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "veraflow-questionnaire-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("https://veraflow.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ path: join("dist", path === "/" ? "index.html" : path.slice(1)) });
  });
  await page.goto("https://veraflow.test/");
  const request = {
    format: "veraflow-collection-request",
    version: 1,
    requestId: "00000000-browser-fixture",
    questions: [
      { id: "role", label: "<b>职位</b>", instructions: "请填写现任职位。", type: "text", required: true },
      { id: "remote", label: "远程", type: "boolean", required: true, options: [
        { id: "true", label: "是" }, { id: "false", label: "否" },
      ] },
      { id: "notes", label: "说明", type: "textarea", required: false, multiline: true, allowBlankLines: false },
      { id: "unused", label: "其他", type: "text", required: false },
    ],
  };
  const select = (contents) => page.locator("#collection-file").setInputFiles({
    name: "request.json",
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });
  const questionnaire = page.getByRole("button", { name: "Download questionnaire HTML" });
  await select(JSON.stringify({ ...request, recordState: { value: "Private" } }));
  await page.getByRole("alert").getByText("Choose a valid VeraFlow v1 collection request in UTF-8 JSON.").waitFor();
  assert.equal(await questionnaire.isVisible(), false);
  await select(JSON.stringify(request));
  await page.getByText("<b>职位</b>", { exact: true }).waitFor();
  const pending = page.waitForEvent("download");
  await questionnaire.click();
  const html = join(directory, "renamed-questionnaire.html");
  await (await pending).saveAs(html);

  const context = await browser.newContext({ offline: true });
  const offline = await context.newPage();
  const requests = [];
  const errors = [];
  offline.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  offline.on("pageerror", (error) => errors.push(error.message));
  await offline.goto(pathToFileURL(html).href);
  const responseButton = offline.getByRole("button", { name: "Download response JSON" });
  await responseButton.click();
  await offline.getByText("Answer this required question.").waitFor();
  await offline.getByLabel("<b>职位</b>", { exact: false }).fill("软件架构师");
  await offline.getByRole("radio", { name: "否" }).check();
  await offline.getByLabel("说明").fill("第一行\n\n第二行");
  async function saveResponse() {
    const pending = offline.waitForEvent("download");
    await responseButton.click();
    return JSON.parse(await readFile(await (await pending).path(), "utf8"));
  }
  const first = await saveResponse();
  assert.equal(first.requestId, request.requestId);
  assert.deepEqual(first.fields, { role: "软件架构师", remote: "false", notes: "第一行\n第二行" });
  assert.deepEqual(await saveResponse(), first);
  await offline.getByRole("radio", { name: "是" }).check();
  const changed = await saveResponse();
  assert.notEqual(changed.responseId, first.responseId);
  assert.equal(changed.fields.remote, "true");
  await offline.getByRole("button", { name: "简体中文" }).click();
  await offline.getByRole("button", { name: "下载回答 JSON" }).waitFor();
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});
