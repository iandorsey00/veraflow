import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = (name: string) =>
  readFile(new URL(`../../examples/portable/${name}`, import.meta.url), "utf8");

async function importDefinition(page: Page, archive: string) {
  await page.goto("/");
  await page.locator("#nav-templates").click();
  const pending = page.waitForEvent("filechooser");
  await page.locator("#import-template").click();
  await (
    await pending
  ).setFiles({
    name: "booking-template.json",
    mimeType: "application/json",
    buffer: Buffer.from(archive),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import JSON", exact: true })
    .click();
  await expect(page.locator("#template-name")).toHaveValue("Booking notice");
}

test("an exported portable template renders the fixture email in a fresh library", async ({
  page,
  browser,
}) => {
  await importDefinition(page, await fixture("booking-template.json"));
  const pending = page.waitForEvent("download");
  await page.locator("#export-template").click();
  const exported = await readFile((await (await pending).path())!, "utf8");
  const fresh = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const imported = await fresh.newPage();
    await importDefinition(imported, exported);
    const cases = JSON.parse(await fixture("cases.json"));
    const review = cases.find(
      (entry: { name: string }) => entry.name === "conditional field visible",
    );
    await imported.locator("#start-form").click();
    await expect(imported.getByLabel("note", { exact: true })).toHaveCount(0);
    await imported
      .getByLabel("reference", { exact: true })
      .fill(review.values.reference);
    await imported.getByLabel("name", { exact: true }).fill(review.values.name);
    await imported
      .getByRole("radio", { name: "DOA review", exact: true })
      .check();
    await imported.getByLabel("note", { exact: true }).fill(review.values.note);
    await imported.locator("#finish").click();
    for (const [index, part] of review.parts.entries()) {
      if (index) await imported.locator("#email-next").click();
      await expect(imported.locator(".output")).toHaveJSProperty(
        "textContent",
        part.text,
      );
    }
  } finally {
    await fresh.close();
  }
});
