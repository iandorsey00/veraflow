import { test, expect, type Page } from "@playwright/test";
import { defineScanner, addField } from "./fixtures";
async function drag(page: Page, list: string, from: number, to: number) {
  await page
    .locator(`${list} [data-reorder="${from}"] [data-drag-handle]`)
    .dragTo(page.locator(`${list} [data-reorder="${to}"]`));
}
test("capture and email order support drag with arrows and persist after toggling", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-templates").click();
  await page.locator("#email-subject").fill("{{subject}}");
  await page.locator("#email-to").fill("{{recipient}}");
  await page.locator("#template-content").fill("{{first}} {{second}}");
  await page.locator('#field-order [data-reorder="3"]').evaluate((el) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", "external");
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.locator("#field-order code")).toHaveText([
    "subject",
    "recipient",
    "first",
    "second",
  ]);
  await drag(page, "#field-order", 0, 3);
  await expect(page.locator("#field-order code")).toHaveText([
    "recipient",
    "first",
    "second",
    "subject",
  ]);
  await page.locator('[data-up="3"]').click();
  await expect(page.locator("#field-order code")).toHaveText([
    "recipient",
    "first",
    "subject",
    "second",
  ]);
  await drag(page, "#email-order", 0, 1);
  await expect(
    page.locator("#email-order > li > span:not([data-drag-handle])"),
  ).toHaveText(["To", "Subject", "Body"]);
  await page.locator("#save").click();
  await page.locator("#email-enabled").uncheck();
  await page.locator("#email-enabled").check();
  await expect(page.locator("#field-order code")).toHaveText([
    "recipient",
    "first",
    "subject",
    "second",
  ]);
  await page.locator("#save").click();
  await page.locator("#nav-settings").click();
  await page.locator("#nav-templates").click();
  await expect(page.locator("#field-order code")).toHaveText([
    "recipient",
    "first",
    "subject",
    "second",
  ]);
  await expect(
    page.locator("#email-order > li > span:not([data-drag-handle])"),
  ).toHaveText(["To", "Subject", "Body"]);
});
test("Scanner drag and arrow moves preserve active field, values and verification", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-scanner").click();
  await defineScanner(page);
  await page.locator("#manual-value").fill("PRIVATE-104");
  await page.locator("#apply-value").click();
  await page.locator("#verify-start").click();
  await page.locator("#manual-value").fill("PRIVATE-104");
  await page.locator("#apply-value").click();
  await addField(page, "address");
  await page.locator("#field-0").click();
  await drag(page, ".capture-fields", 0, 1);
  await expect(page.locator(".capture-field strong")).toHaveText([
    "address",
    "Field 1",
  ]);
  await expect(page.locator("#field-1")).toHaveClass(/verified/);
  await expect(page.locator("#field-1")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.locator('[data-scanner-up="1"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#field-0 .field-value")).toHaveText("PRIVATE-104");
  await expect(page.locator("#field-0")).toHaveClass(/verified/);
});
test("update action belongs to navigation and Settings header, with busy guard", async ({
  page,
}) => {
  await page.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        "\nwindow.__checkUpdate=checkAvailableUpdate;",
    });
  });
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        '\nplatform.checkUpdate=async()=>({version:"9.0.0",notes:"test"});',
    });
  });
  await page.goto("/");
  await page.evaluate(() => (window as any).__checkUpdate());
  await expect(page.locator("nav #update-now")).toBeVisible();
  await page.locator("#nav-settings").click();
  await expect(page.locator(".settings header #update-app")).toHaveText(
    "Update now",
  );
  await expect(page.locator(".about #update-app")).toHaveCount(0);
  await page.locator("#nav-templates").click();
  await page.locator("#template-name").fill("Unsaved");
  await page.locator("#update-now").click();
  await expect(page.getByRole("alert").first()).toContainText("Finish");
});
