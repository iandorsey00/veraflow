import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("one-template export includes current edits and imports a fresh copy", async ({
  page,
}) => {
  await page.goto("/?workflow=classic");
  await page.locator("#nav-templates").click();
  const originalIds = await page
    .locator("[data-template]")
    .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.template));
  await page.locator("#template-name").fill("Shared draft");
  await page.locator("#extra-scanner-fields").fill("reference");
  const pending = page.waitForEvent("download");
  await page.locator("#export-template").click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("veraflow-template.json");
  const path = (await download.path())!;
  const archive = JSON.parse(await readFile(path, "utf8"));
  expect(archive.templates).toHaveLength(1);
  expect(archive.templates[0].name).toBe("Shared draft");
  expect(archive.templates[0].extraFields).toEqual(["reference"]);
  // Export does not save the draft; discard explicitly before importing.
  await page.locator("#nav-settings").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page.locator("#nav-templates").click();
  await expect(page.locator("#template-name")).not.toHaveValue("Shared draft");
  const choose = page.waitForEvent("filechooser");
  await page.locator("#import-template").click();
  await (await choose).setFiles(path);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import JSON", exact: true })
    .click();
  await expect(page.locator("#template-name")).toHaveValue("Shared draft");
  const ids = await page
    .locator("[data-template]")
    .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.template));
  expect(ids.length).toBe(originalIds.length + 1);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of originalIds) expect(ids).toContain(id);
});
test("one-template import rejects a library and invalid drafts cannot export", async ({
  page,
}) => {
  await page.goto("/?workflow=classic");
  await page.locator("#nav-templates").click();
  const pending = page.waitForEvent("download");
  await page.locator("#export-templates").click();
  const d = await pending;
  const choose = page.waitForEvent("filechooser");
  await page.locator("#import-template").click();
  await (await choose).setFiles((await d.path())!);
  await expect(page.getByRole("alert").first()).toContainText("one template");
  await page.locator("#extra-scanner-fields").fill("{{invalid}}");
  await page.locator("#export-template").click();
  await expect(page.getByRole("alert").first()).toContainText("unique names");
});
