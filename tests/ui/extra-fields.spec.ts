import { test, expect } from "@playwright/test";
for (const email of [false, true])
  test(`extra Scanner fields capture, verify, output omission and completion transfer (email=${email})`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?workflow=classic");
    await page.locator("#nav-templates").click();
    if (!email) await page.locator("#email-enabled").uncheck();
    await page.locator("#template-content").fill("Hello {{full name}}");
    if (email) {
      await page.locator("#email-subject").fill("Update");
      await page.locator("#email-to").fill("alex@example.test");
    }
    await page
      .locator("#extra-scanner-fields")
      .fill("booking reference\n\nfull name\nbooking reference");
    await page.locator("#save").click();
    await expect(page.locator("#extra-scanner-fields")).toHaveValue(
      "booking reference\nfull name",
    );
    await page.locator("#start").click();
    await page.getByText("Enter value manually", { exact: true }).click();
    for (let round = 0; round < 2; round++)
      for (const value of ["Alex", "AB-104"]) {
        await page.locator("#manual-value").fill(value);
        await page.locator("#apply-value").click();
        await expect(page.locator("#app")).not.toHaveAttribute(
          "aria-busy",
          "true",
        );
      }
    await page.locator("#finish").click();
    if (email) {
      for (let i = 0; i < 3; i++) await page.locator("#email-next").click();
      await page.locator("#email-done").click();
    } else
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "Hello Alex",
      );
    await expect(page.locator("#email-to-scanner")).toBeVisible();
    await page.locator("#email-to-scanner").click();
    await expect(page.locator(".field-value")).toHaveText(["Alex", "AB-104"]);
    await expect(page.locator(".capture-field.verified")).toHaveCount(2);
    await page.locator("#field-1").click();
    await page.locator("#scanner-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "AB-104",
    );
  });
test("invalid extra field names stay editable without damaging the draft or persisted template", async ({
  page,
}) => {
  await page.goto("/?workflow=classic");
  await page.locator("#nav-templates").click();
  await page.locator("#extra-scanner-fields").fill("{{bad}}");
  await page.locator("#save").click();
  await expect(page.getByRole("alert").first()).toContainText("unique names");
  await expect(page.locator("#extra-scanner-fields")).toHaveValue("{{bad}}");
  await page.locator("#email-enabled").uncheck();
  await expect(page.locator("#extra-scanner-fields")).toHaveValue("{{bad}}");
  await page.locator("#extra-scanner-fields").fill("booking reference");
  await page.locator("#save").click();
  await page.locator("#nav-settings").click();
  await page.locator("#nav-templates").click();
  await expect(page.locator("#extra-scanner-fields")).toHaveValue(
    "booking reference",
  );
});
test("ordinary template extra fields require an explicit clear choice and never enter template JSON", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?workflow=classic");
  await page.locator("#nav-templates").click();
  await page.locator("#email-enabled").uncheck();
  await page.locator("#template-content").fill("Hello {{name}}");
  await page.locator("#extra-scanner-fields").fill("booking reference");
  await page.getByText("Template options", { exact: true }).click();
  await page.locator("#template-verify").uncheck();
  await page.locator("#start").click();
  await page.getByText("Enter value manually", { exact: true }).click();
  for (const value of ["Alex", "PRIVATE-104"]) {
    await page.locator("#manual-value").fill(value);
    await page.locator("#apply-value").click();
  }
  await page.locator("#finish").click();
  await expect(page.locator("#email-clear-close")).toBeVisible();
  await page.locator("#email-clear-close").click();
  await expect(page.locator("#nav-session")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.locator("#export-templates").click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("booking reference");
  expect(text).not.toContain("PRIVATE-104");
});
