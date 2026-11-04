import { expect, test } from "@playwright/test";

test("Form and Scanner share values and enforce source verification after edits", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator("#nav-templates").click();
  await page.locator("#template-edit > summary").click();
  await page.locator("#email-enabled").uncheck();
  await page
    .locator("#template-content")
    .fill("Booking {{reference}} ({{reference}})");
  await page.getByRole("button", { name: "Fill form", exact: true }).click();
  await expect(page.locator(".template-form textarea")).toHaveCount(1);
  await page.getByLabel("reference", { exact: true }).fill("AB-104");
  await page.locator("#finish").click();
  await expect(page.locator("#notice")).toBeVisible();
  await page.locator("#switch-scanner").click();
  await expect(page.locator(".active-value")).toHaveText("AB-104");
  await page.locator("#manual-entry summary").click();
  await page.locator("#manual-value").fill("AB-104");
  await page.locator("#apply-value").click();
  await page.locator("#switch-form").click();
  await expect(page.locator("#form-state-0")).toHaveText("Matched source");
  await page.locator("#preview").click();
  await expect(page.locator("#form-output")).toHaveText(
    "Booking AB-104 (AB-104)",
  );
  await page.getByLabel("reference", { exact: true }).fill("AB-105");
  await expect(page.locator("#form-output")).toHaveCount(0);
  await expect(page.locator("#form-state-0")).toHaveText("Captured");
  await page.locator("#pause-task").click();
  await page.locator("#resume-task").click();
  await expect(page.getByLabel("reference", { exact: true })).toHaveValue(
    "AB-105",
  );
  await page.locator("#switch-scanner").click();
  await page.locator("#manual-value").fill("AB-105");
  await page.locator("#apply-value").click();
  await page.locator("#switch-form").click();
  await page.locator("#finish").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Booking AB-105 (AB-105)");
});
