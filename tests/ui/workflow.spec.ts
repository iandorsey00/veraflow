import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("capture, mismatch without overwriting, correction, verify, copy and erase", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByLabel("Template text", { exact: true })
    .fill("Hello <name>. Ticket <ticket>. Thanks <name>.");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  if (!(await page.getByLabel("Paste or type a value").isVisible()))
    await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill("Ian");
  await page
    .getByRole("button", { name: "Capture value", exact: true })
    .click();
  if (!(await page.getByLabel("Paste or type a value").isVisible()))
    await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill("UC-P10");
  await page
    .getByRole("button", { name: "Capture value", exact: true })
    .click();
  if (!(await page.getByLabel("Paste or type a value").isVisible()))
    await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill(" Ian  ");
  await page
    .getByRole("button", { name: "Compare value", exact: true })
    .click();
  if (!(await page.getByLabel("Paste or type a value").isVisible()))
    await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill("UC-P1O");
  await page
    .getByRole("button", { name: "Compare value", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "! Mismatch" })).toBeVisible();
  await expect(page.locator(".mismatch-box pre").first()).toHaveText("UC-P10");
  if (!(await page.getByLabel("Paste or type a value").isVisible()))
    await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill("UC-P10");
  await page
    .getByRole("button", { name: "Compare value", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".output")).toHaveText(
    "Hello Ian. Ticket UC-P10. Thanks Ian.",
  );
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  await expect(
    page.getByText("Session values have been cleared."),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Hello Ian. Ticket UC-P10. Thanks Ian.",
  );
  await expect(page.locator("#app")).not.toContainText("UC-P10");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test("Unicode template, order, duplication, deletion and unsaved guard", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByLabel("Template name", { exact: true }).fill("中文");
  await page
    .getByLabel("Template text", { exact: true })
    .fill("<客户姓名> <工单号> <客户姓名>");
  await expect(page.locator("#field-order li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Move up 工单号", exact: true })
    .click();
  await expect(page.locator("#field-order li").first()).toContainText("工单号");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep working" }).click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "中文 (copy)",
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".template-item")).toHaveCount(3);
});
test("Chinese, dark appearance, no verification, narrow UI and keyboard form entry", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByLabel("Appearance", { exact: true }).selectOption("DARK");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("你的更改已保存。")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.setViewportSize({ width: 380, height: 740 });
  await page.getByRole("button", { name: "模板", exact: true }).click();
  await page.getByLabel("模板内容", { exact: true }).fill("您好 <姓名>");
  await page.getByText("模板选项", { exact: true }).click();
  await page.getByLabel("复制前核验", { exact: true }).uncheck();
  await page.getByRole("button", { name: "开始会话", exact: true }).click();
  await page.getByText("手动输入值", { exact: true }).click();
  await page.getByLabel("粘贴或输入值").fill("小明");
  await page.getByLabel("粘贴或输入值").press("Control+Enter");
  await expect(
    page.getByRole("button", { name: "复制结果", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("session remains intact across library navigation and requires cancellation confirmation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  if (!(await page.getByLabel("Paste or type a value").isVisible()))
    await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill("483921");
  await page
    .getByRole("button", { name: "Capture value", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Current session", exact: true })
    .click();
  await expect(page.locator(".field-value").first()).toHaveText("483921");
  await page
    .getByRole("button", { name: "Cancel session", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep working" }).click();
  await expect(page.locator(".field-value").first()).toHaveText("483921");
});

test("keyboard start, capture and navigation; optional verified background", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const green = page.getByLabel("Green background when verification succeeds");
  await expect(green).not.toBeChecked();
  await green.check();
  await page.getByLabel("Advance automatically", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByLabel("Template text", { exact: true })
    .fill("<name> <reference>");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#field-0")).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByLabel("Paste or type a value")).toBeFocused();
  await page.keyboard.type("Alex");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#field-1")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.locator("#field-0")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.type("PR-104");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("body")).not.toHaveClass(/verified-background/);
  await page.keyboard.type("Alex");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("PR-1O4");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("heading", { name: "! Mismatch" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/verified-background/);
  await page.getByLabel("Paste or type a value").fill("PR-104");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("body")).toHaveClass(/verified-background/);
  await expect(
    page.getByRole("button", { name: "Copy result", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.getByRole("button", { name: "Clear field", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/verified-background/);
});
