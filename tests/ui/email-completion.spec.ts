import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function finishEmail(page: Page) {
  await page.goto("/?workflow=classic");
  await page.locator("#nav-templates").click();
  await expect(page.locator(".appbar nav button").nth(0)).toHaveText(
    "Workspace",
  );
  await expect(page.locator(".appbar nav button").nth(1)).toHaveText(
    "Templates",
  );
  await expect(
    page.getByRole("heading", { name: "Templates", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#placeholder-style")).toHaveValue("braces");
  await expect(page.locator("#email-enabled")).toBeChecked();
  await page.locator("#start").click();
  await page.getByText("Enter value manually", { exact: true }).click();
  const values = [
    "Project update",
    "alex@example.test",
    "Alex",
    "Ready for review 104",
  ];
  for (let round = 0; round < 2; round++)
    for (const value of values) {
      await page.getByLabel("Paste or type a value").fill(value);
      await page.locator("#apply-value").click();
      await expect(page.locator("#app")).not.toHaveAttribute(
        "aria-busy",
        "true",
      );
    }
  await page.locator("#finish").click();
  for (let i = 0; i < 3; i++) {
    await page.locator("#email-next").click();
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  }
  await page.locator("#email-done").click();
  await expect(page.locator("#email-to-scanner")).toBeVisible();
}
test("completed email opens captured fields in Scanner for individual transfer", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        "\nplatform.tray=async handler=>{window.__tray=handler;};platform.active=async active=>{window.__guard=active;};",
    });
  });
  await finishEmail(page);
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => (window as any).__guard)).toBe(true);
  await page.evaluate(() => (window as any).__tray("quit"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.locator("#email-to-scanner").click();
  await expect(page.locator(".field-value")).toHaveText([
    "Project update",
    "alex@example.test",
    "Alex",
    "Ready for review 104",
  ]);
  await page.locator("#scanner-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Project update",
  );
  await expect(
    page.getByRole("button", { name: "Add field", exact: true }),
  ).toBeVisible();
  await page.locator("#scanner-rename").click();
  await page.getByRole("dialog").getByLabel("Field name").fill("email subject");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save name" })
    .click();
  await expect(page.locator(".capture-field strong").first()).toHaveText(
    "email subject",
  );
  await expect(page.locator(".field-value").first()).toHaveText(
    "Project update",
  );
});
test("completed email can clear all fields and close without retaining output", async ({
  page,
}) => {
  await finishEmail(page);
  await page.locator("#email-clear-close").click();
  await expect(page.locator("#template-content")).toBeVisible();
  await expect(page.locator("#app")).not.toContainText("Ready for review 104");
  await expect(page.locator("#nav-session")).toHaveCount(0);
  await page.locator("#new").click();
  await expect(page.locator("#placeholder-style")).toHaveValue("braces");
});
