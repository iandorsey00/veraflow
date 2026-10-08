import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const colorScheme of ["light", "dark"] as const)
  test(`accessible editor and capture in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByLabel("Green background for verified fields", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page.getByLabel("Template text", { exact: true }).fill("<reference>");
    await page
      .getByRole("button", { name: "Start session", exact: true })
      .click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Control+Enter");
    await page.getByLabel("Paste or type a value").fill("PR-104");
    await page.keyboard.press("Control+Enter");
    await page.getByLabel("Paste or type a value").fill("PR-104");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#field-0")).toHaveClass(/verified-background/);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
