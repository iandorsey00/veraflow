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
    .fill("{{客户姓名}} {{工单号}} {{客户姓名}}");
  await expect(page.locator("#field-order li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Move up 工单号", exact: true })
    .click();
  await expect(page.locator("#field-order li").first()).toContainText("工单号");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep working" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.locator(".template-item")).toHaveCount(3);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "中文 (copy)",
  );
  await expect(page.locator(".template-item")).toHaveCount(4);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
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
  const green = page.getByLabel("Green background for verified fields");
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
  await expect(page.locator("#field-0")).toHaveClass(/verified-background/);
  await expect(page.locator("#field-1")).not.toHaveClass(/verified-background/);
  await page.keyboard.type("PR-1O4");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("heading", { name: "! Mismatch" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/verified-background/);
  await page.getByLabel("Paste or type a value").fill("PR-104");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#field-0")).toHaveClass(/verified-background/);
  await expect(page.locator("#field-1")).toHaveClass(/verified-background/);
  await expect(page.locator("body")).not.toHaveClass(/verified-background/);
  await expect(
    page.getByRole("button", { name: "Copy result", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.getByRole("button", { name: "Clear field", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/verified-background/);
});

test("email mode is opt-in, persists template sections, and prepares keyboard output", async ({
  page,
}) => {
  await expect(
    page.getByLabel("Email mode", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Template text", { exact: true }).fill("Hello <name>");
  await page.getByLabel("Email mode", { exact: true }).check();
  await expect(
    page.getByLabel("Include Cc", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Include Bcc", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Subject", { exact: true }).fill("Update for <name>");
  await page.getByLabel("To", { exact: true }).fill("alex@example.test");
  await page.getByLabel("Include Bcc", { exact: true }).check();
  await page.getByLabel("Bcc", { exact: true }).fill("<secret_recipient>");
  await expect(page.locator("#field-order li")).toHaveCount(2);
  await page.getByLabel("Include Bcc", { exact: true }).uncheck();
  await expect(page.locator("#field-order li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Update for <name>",
  );
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Control+Enter");
  await page.getByLabel("Paste or type a value").fill("Alex");
  await page.keyboard.press("Control+Enter");
  await page.getByLabel("Paste or type a value").fill("Alex");
  await page.keyboard.press("Control+Enter");
  await page
    .getByRole("button", { name: "Prepare email output", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Paste email sections" }),
  ).toBeVisible();
  await expect(page.locator(".output")).toHaveText("Update for Alex");
  await expect(
    page.getByRole("button", { name: "Finish email session" }),
  ).toBeDisabled();
  await expect(page.locator("#app")).not.toContainText("secret_recipient");
});

test("shortcut registration failure still opens a usable session", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /if \(!desktop\) return;?/,
      'if (!desktop && shortcuts) throw new ShortcutBindingError("capture", shortcuts.capture); if (!desktop) return;',
    );
    await route.fulfill({ response, body });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel session", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/A shortcut is invalid/)).toContainText(
    "CommandOrControl+Shift+1",
  );
  await page.getByText("Enter value manually", { exact: true }).click();
  await page.getByLabel("Paste or type a value").fill("Synthetic value");
  await page
    .getByRole("button", { name: "Capture value", exact: true })
    .click();
  await expect(page.locator(".field-value").first()).toHaveText(
    "Synthetic value",
  );
});

test("JSON export imports copies without overwriting the original", async ({
  page,
}) => {
  const originalIds = await page
    .locator("[data-template]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.template),
    );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await (await chooserPromise).setFiles((await download.path())!);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import JSON", exact: true })
    .click();
  await expect(
    page.getByText("Templates imported as new copies.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-template]")).toHaveCount(
    originalIds.length * 2,
  );
  const ids = await page
    .locator("[data-template]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.template),
    );
  expect(new Set(ids).size).toBe(originalIds.length * 2);
  for (const id of originalIds) expect(ids).toContain(id);
});

test("mouse panel starts enabled and resets after opting out", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByLabel("Mouse transfer panel", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Mouse transfer panel", { exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Transfer", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Mouse transfer panel", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Transfer", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mouse transfer panel", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Cancel session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Erase session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByLabel("Mouse transfer panel", { exact: true }),
  ).toBeChecked();
});

test("unsafe clipboard recovery changes only this session and retries mouse transfer", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\nplatform.mouseSource=async()=>true; platform.mouseTransfer=async(restore)=>{ if(restore)throw Error("clipboardUnsafe"); return "Recovered"; };`,
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.getByLabel("Mouse transfer panel", { exact: true }).check();
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "cannot be safely preserved",
  );
  await page
    .getByLabel("Preserve clipboard for this session", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(page.locator(".field-value").first()).toHaveText("Recovered");
  await page
    .getByRole("button", { name: "Cancel session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Erase session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByLabel("Preserve clipboard for this session", { exact: true }),
  ).toBeChecked();
});
test("failed email paste can be recovered with manual keyboard navigation", async ({
  page,
}) => {
  await page.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()) + `\nwindow.__dispatch = dispatch;`,
    });
  });
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\nplatform.deliver=async()=>{window.__deliverCalls=(window.__deliverCalls||0)+1;throw Error("emailPasteFailed");};`,
    });
  });
  await page.reload();
  await page.getByLabel("Template text", { exact: true }).fill("Body");
  await page.getByLabel("Email mode", { exact: true }).check();
  await page.getByLabel("Subject", { exact: true }).fill("Subject text");
  await page.getByLabel("To", { exact: true }).fill("alex@example.test");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare email output", exact: true })
    .click();
  await page.evaluate(() => (window as any).__dispatch("finish"));
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  await expect(page.locator(".output")).toHaveText("Subject text");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".output")).toHaveText("alex@example.test");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.locator(".output")).toHaveText("Subject text");
  await page
    .getByRole("button", { name: "Next section (manual)", exact: true })
    .click();
  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(
    page.getByRole("button", { name: "Finish email session", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__deliverCalls)).toBe(1);
});

test("email paste order and omitted Subject persist and control delivery", async ({
  page,
}) => {
  await page.getByLabel("Template text", { exact: true }).fill("Body text");
  await page.getByLabel("Email mode", { exact: true }).check();
  await page.getByLabel("Subject", { exact: true }).fill("Subject text");
  await page.getByLabel("To", { exact: true }).fill("alex@example.test");
  await page.getByLabel("Include Cc", { exact: true }).check();
  await page.getByLabel("Cc", { exact: true }).fill("team@example.test");
  await page
    .getByRole("button", { name: "Move up To", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Move down To", exact: true }),
  ).toBeFocused();
  await expect(
    page.locator(".email-template .field-order li").first(),
  ).toContainText("To");
  await page.getByLabel("Include Subject", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await expect(
    page.getByLabel("Include Subject", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare email output", exact: true })
    .click();
  await expect(page.locator(".output")).toHaveText("alex@example.test");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".output")).toHaveText("team@example.test");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".output")).toHaveText("Body text");
});
test("removing address blank lines invalidates verification and verifies cleaned output", async ({
  page,
}) => {
  await page.getByLabel("Template text", { exact: true }).fill("<address>");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.keyboard.press("Control+Enter");
  const address = "12 Example Road\n\n  Suite 4\n   \nTown";
  await page.getByLabel("Paste or type a value").fill(address);
  await page.keyboard.press("Control+Enter");
  await page.getByLabel("Paste or type a value").fill(address);
  await page.keyboard.press("Control+Enter");
  await page
    .getByRole("button", { name: "Remove blank lines", exact: true })
    .click();
  await expect(page.locator("#field-0")).toHaveClass(/captured/);
  await expect(page.locator("#field-0")).not.toHaveClass(/verified/);
  await expect(page.locator(".field-value")).toHaveText(
    "12 Example Road\n  Suite 4\nTown",
  );
  await page.getByLabel("Paste or type a value").fill(address);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#field-0")).toHaveClass(/verified/);
});
