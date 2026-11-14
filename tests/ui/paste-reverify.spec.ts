import { test, expect, type Page } from "@playwright/test";
import { defineScanner, addField } from "./fixtures";
const pasteKey = process.platform === "darwin" ? "Meta+V" : "Control+V";
async function paste(page: Page, index: number, value: string) {
  await page.evaluate((v) => navigator.clipboard.writeText(v), value);
  await page.locator(`#field-${index}`).focus();
  await page.keyboard.press(pasteKey);
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
for (const kind of ["scanner", "template", "email"])
  test(`paste and selective/all reverification (${kind})`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?workflow=classic");
    const scanner = kind === "scanner";
    if (scanner) {
      await page.locator("#nav-scanner").click();
      await defineScanner(page);
      await addField(page, "second");
      await page.locator("#field-0").click();
    } else {
      await page.locator("#nav-templates").click();
      if (kind === "email") {
        await page.locator("#email-subject").fill("Update");
        await page.locator("#email-to").fill("alex@example.test");
      } else await page.locator("#email-enabled").uncheck();
      await page.locator("#template-content").fill("{{first}} {{second}}");
      await page.locator("#start").click();
    }
    await paste(page, 0, "A");
    await paste(page, 1, "B");
    if (scanner) {
      await page.locator(".reverification summary").click();
      await page.locator("#reverify-all").click();
    }
    await paste(page, 0, "A");
    await paste(page, 1, "B");
    await expect(page.locator(".capture-field.verified")).toHaveCount(2);
    await page.locator("#field-0").click();
    await page.locator(".reverification summary").click();
    await page.locator("#reverify-field").click();
    await expect(page.locator("#field-0")).not.toHaveClass(/verified/);
    await expect(page.locator("#field-1")).toHaveClass(/verified/);
    await paste(page, 0, "wrong");
    await expect(page.locator(".mismatch-box")).toBeVisible();
    await expect(page.locator("#field-0 .field-value")).toHaveText("A");
    await paste(page, 0, "A");
    await expect(page.locator(".capture-field.verified")).toHaveCount(2);
    await page.locator(".reverification summary").click();
    await page.locator("#reverify-all").click();
    await expect(page.locator(".capture-field.verified")).toHaveCount(0);
    await paste(page, 0, "A");
    await paste(page, 1, "B");
    await expect(page.locator(".capture-field.verified")).toHaveCount(2);
    if (scanner) {
      await expect(page.locator(".scanner-field-tools")).toHaveCount(0);
      await page.locator("#scanner-reorder").click();
      await expect(page.locator(".scanner-field-tools")).toHaveCount(2);
      await page.locator("#scanner-reorder").click();
      await expect(page.locator(".scanner-field-tools")).toHaveCount(0);
    }
  });
test("paste in editable text remains normal editing and field replacement loses verification", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?workflow=classic");
  await page.locator("#nav-scanner").click();
  await defineScanner(page);
  await paste(page, 0, "Original");
  await page.locator("#verify-start").click();
  await paste(page, 0, "Original");
  await expect(page.locator("#field-0")).toHaveClass(/verified/);
  await page.locator("#manual-value").fill("prefix ");
  await page.locator("#manual-value").press("End");
  await page.evaluate(() => navigator.clipboard.writeText("suffix"));
  await page.locator("#manual-value").press(pasteKey);
  await expect(page.locator("#manual-value")).toHaveValue("prefix suffix");
  await expect(page.locator("#field-0 .field-value")).toHaveText("Original");
  await page.locator("#field-0").click();
  await paste(page, 0, "Replacement");
  await expect(page.locator("#field-0 .field-value")).toHaveText("Replacement");
  await expect(page.locator("#field-0")).not.toHaveClass(/verified/);
});
