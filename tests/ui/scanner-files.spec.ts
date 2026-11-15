import { test, expect } from "@playwright/test";
test("Scanner JSON import restores values as captured and field-only export omits values", async ({
  page,
}) => {
  await page.goto("/?workflow=classic");
  await page.locator("#nav-scanner").click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#import-scanner-home").click();
  await (
    await chooser
  ).setFiles({
    name: "scanner.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "veraflow-scanner",
        version: 1,
        fields: [{ name: "reference", value: "AB-104" }],
        output: "{{reference}}",
      }),
    ),
  });
  await expect(page.locator(".field-value")).toHaveText("AB-104");
  await expect(page.locator(".capture-field")).toHaveClass(/captured/);
  await page.getByText("More tools", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.locator("#scanner-export-fields").click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  expect(
    JSON.parse(await readFile((await file.path())!, "utf8")).fields,
  ).toEqual([{ name: "reference" }]);
});
test("template-only setup infers spaced fields and Scanner fits a 300px window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 300, height: 740 });
  await page.goto("/?workflow=classic");
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page
    .locator("#dialog-output")
    .fill("Booking {{ full name }} / {{booking reference}}");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  await expect(page.locator(".capture-field strong")).toHaveText([
    "full name",
    "booking reference",
  ]);
  await page.locator("#manual-value").fill("x".repeat(200));
  await page.locator("#apply-value").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("More tools", { exact: true }).click();
  await expect(page.locator(".template-match .matched")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
