import { legacyTemplate, renameField, addField } from "./fixtures";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function fill(page: Page, value: string) {
  await page.getByLabel("Paste or type a value", { exact: true }).fill(value);
  await page.locator("#apply-value").click();
}
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Scanner", exact: true }).click();
  await page
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
}
test("Scanner verifies one field, blocks mismatches, copies and collects another field", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page);
  await expect(page.getByLabel("Paste or type a value")).toBeVisible();
  await fill(page, "PR-104");
  await page.getByRole("button", { name: "Copy field", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Verify this field");
  await page.locator("#verify-start").click();
  await fill(page, "PR-1O4");
  await expect(page.locator(".mismatch-box")).toBeVisible();
  await fill(page, "PR-104");
  await page.getByRole("button", { name: "Copy field", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "PR-104",
  );
  await addField(page, "address");
  await expect(page.locator(".capture-field strong")).toHaveText([
    "Field 1",
    "address",
  ]);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.locator("#field-0")).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
for (const keep of [false, true])
  test(`template completion returns to Scanner with explicit retention ${keep}`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route("**/src/main.ts*", async (route) => {
      const r = await route.fetch();
      await route.fulfill({
        response: r,
        body: (await r.text()) + "\nwindow.__navigate = navigate;",
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await legacyTemplate(page);
    await page
      .getByLabel("Template text", { exact: true })
      .fill("Hello <name>");
    await page
      .getByRole("button", { name: "Save template", exact: true })
      .click();
    await page.getByRole("button", { name: "Scanner", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Scanner", exact: true })
      .click();
    await renameField(page, "name");
    await fill(page, "Alex");
    await expect(page.locator(".capture-field strong")).toHaveText(["name"]);
    await expect(page.locator(".field-value")).toHaveText(["Alex"]);
    await page.getByText("Fields and output", { exact: true }).click();
    await page
      .locator("summary")
      .filter({ hasText: /^Use a template$/ })
      .click();
    await expect(page.locator("#scanner-keep")).not.toBeChecked();
    if (keep) await page.locator("#scanner-keep").check();
    await page.locator("#scanner-apply").click();
    await expect(page.locator(".field-value")).toHaveText("Alex");
    await expect(page.locator("#field-0")).not.toHaveClass(/verified/);
    await page.getByText("Enter value manually", { exact: true }).click();
    await fill(page, "Alex");
    await page
      .getByRole("button", { name: "Copy result", exact: true })
      .click();
    if (keep) {
      // Simulate the desktop tray opening Templates after completion.
      await page.evaluate(() => (window as any).__navigate("templates"));
      await page
        .getByRole("button", { name: "Start session", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Keep working", exact: true })
        .click();
      await page.locator("#nav-session").click();
    }
    await page
      .getByRole("button", { name: "Return to Scanner", exact: true })
      .click();
    await expect(page.locator(".field-value")).toHaveText(keep ? "Alex" : "—");
  });
test("failed Scanner paste does not advance and only sends requested text and Tab", async ({
  page,
}) => {
  await page.route("**/src/main.ts*", async (route) => {
    const r = await route.fetch();
    await route.fulfill({
      response: r,
      body: (await r.text()) + "\nwindow.__dispatch = dispatch;",
    });
  });
  await page.route("**/src/platform.ts*", async (route) => {
    const r = await route.fetch();
    await route.fulfill({
      response: r,
      body:
        (await r.text()) +
        `\nplatform.deliver=async(text,tab)=>{window.__delivery=[text,tab]; if(!window.__allowPaste) throw Error("emailDeliveryFailed");};`,
    });
  });
  await start(page);
  await fill(page, "Alex");
  await page.locator("#verify-start").click();
  await fill(page, "Alex");
  await addField(page, "second");
  await page.locator("#field-0").click();
  await page.getByText("Fields and output", { exact: true }).click();
  await page.getByText("Output shortcut", { exact: true }).first().click();
  await page.locator("#scanner-output").selectOption("tab");
  await page.evaluate(() => (window as any).__dispatch("finish"));
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("#field-0")).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(await page.evaluate(() => (window as any).__delivery)).toEqual([
    "Alex",
    true,
  ]);
  await page.evaluate(() => {
    (window as any).__allowPaste = true;
    (window as any).__dispatch("finish");
  });
  await expect(page.locator("#field-1")).toHaveAttribute(
    "aria-current",
    "step",
  );
});

test("Scanner is usable in Chinese dark mode and removing an empty field preserves other values", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await start(page);
  await fill(page, "Alex");
  await addField(page, "second");
  if (!(await page.locator("#scanner-remove").isVisible()))
    await page.getByText("Fields and output", { exact: true }).click();
  await page.locator("#scanner-remove").click();
  await expect(page.locator(".field-value")).toHaveText("Alex");
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByRole("button", { name: "扫描器", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "扫描器", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("removing a captured Scanner field requires its explicit action", async ({
  page,
}) => {
  await start(page);
  await fill(page, "Alex");
  await addField(page, "second");
  await page.locator("#field-0").click();
  if (!(await page.locator("#scanner-remove").isVisible()))
    await page.getByText("Fields and output", { exact: true }).click();
  await page.locator("#scanner-remove").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await expect(page.locator(".field-value").first()).toHaveText("Alex");
  if (!(await page.locator("#scanner-remove").isVisible()))
    await page.getByText("Fields and output", { exact: true }).click();
  await page.locator("#scanner-remove").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove field", exact: true })
    .click();
  await expect(page.locator(".capture-field strong")).toHaveText(["second"]);
});
