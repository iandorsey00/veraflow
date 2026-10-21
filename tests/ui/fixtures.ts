import { expect, type Page } from "@playwright/test";
// Deliberately exercise legacy compatibility independently of new example defaults.
export async function legacyTemplate(page: Page) {
  if (!(await page.locator("#template-content").isVisible())) return;
  await page.locator("#email-enabled").uncheck();
  await page.locator("#placeholder-style").selectOption("angle");
  await page
    .locator("#template-content")
    .fill("Hello <name>. Reference <reference>.");
  await page.locator("#save").click();
}
export async function renameField(page: Page, name: string) {
  await page.locator("#scanner-rename").click();
  await page
    .getByRole("dialog")
    .getByLabel("Field name", { exact: true })
    .fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save name", exact: true })
    .click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
export async function addField(page: Page, name: string) {
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Field name", { exact: true })
    .fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save name", exact: true })
    .click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}

export async function defineScanner(page: Page) {
  await page.locator("#start-scanner").click();
  await page.locator("#dialog-fields").fill("Field 1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
