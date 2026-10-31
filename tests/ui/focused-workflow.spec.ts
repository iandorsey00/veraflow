import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function scanner(
  page: Page,
  fields = "Passenger name\nBooking reference",
) {
  await page.goto("/");
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page.locator("#dialog-fields").fill(fields);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
}
async function fill(page: Page, text: string) {
  await page.locator("#manual-value").fill(text);
  await page.locator("#apply-value").click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}

test("focused Scanner preserves values and unfinished typing through pause, view switches, and field navigation", async ({
  page,
}) => {
  await scanner(page);
  await fill(page, "Alex Example");
  await expect(page.locator("#active-task-heading")).toHaveText(
    "Booking reference",
  );
  await page.locator("#manual-value").fill("AB-104 unfinished");
  await page.locator("#pause-task").click();
  await expect(page.locator(".paused-task")).toContainText(
    "1/2 captured · 0/2 matched source",
  );
  await expect(page.locator(".paused-task")).toContainText("Booking reference");
  await page.locator("#resume-task").click();
  await expect(page.locator("#manual-value")).toHaveValue("AB-104 unfinished");
  await expect(page.locator("#manual-value")).toBeFocused();
  await page.locator("#toggle-workflow").click();
  await expect(page.locator(".focused-session")).toHaveCount(0);
  await expect(page.locator("#manual-value")).toHaveValue("AB-104 unfinished");
  await page.locator("#toggle-workflow").click();
  await page.locator("#field-0").click();
  await expect(page.locator("#manual-value")).toHaveValue("");
  await page.locator("#field-1").click();
  await expect(page.locator("#manual-value")).toHaveValue("AB-104 unfinished");
  await expect(page.locator("#field-0 .field-value")).toHaveText(
    "Alex Example",
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("checking keeps mismatched values, reports source matches, and only explicit copy writes the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await scanner(page, "Booking reference");
  await fill(page, "AB-104");
  await expect(page.locator("#scanner-copy")).toBeDisabled();
  await page.locator("#field-0").focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+C" : "Control+C",
  );
  await expect(page.locator("#notice")).toContainText("Verify this field");
  await page.locator("#verify-start").click();
  await fill(page, "AB-1O4");
  await expect(page.locator(".mismatch-box")).toBeVisible();
  await expect(page.locator(".active-value")).toHaveText("AB-104");
  await expect(page.locator(".task-receipt")).toContainText("Source differed");
  await fill(page, "AB-104");
  await expect(page.locator(".active-status")).toHaveText("Matched source");
  await expect(page.locator(".task-progress")).toContainText(
    "1/1 matched source",
  );
  await page.locator("#scanner-copy").click();
  await expect(page.locator(".task-receipt")).toContainText(
    "Copied to clipboard",
  );
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("AB-104");
  await page.locator("#task-tools summary").first().click();
  await page.locator("#reverify-field").click();
  await expect(page.locator(".task-progress")).toContainText(
    "0/1 matched source",
  );
  await expect(page.locator(".active-value")).toHaveText("AB-104");
});

test("template capture, check, preview and completion remain available in focused view", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator("#nav-templates").click();
  await page.locator("#email-enabled").uncheck();
  await page.locator("#template-content").fill("Hello {{name}}.");
  await page.locator("#start").click();
  await page.locator("#manual-entry summary").click();
  await fill(page, "Alex");
  await expect(page.locator(".active-task .eyebrow")).toContainText(
    "compare a fresh source",
  );
  await fill(page, "Alex");
  await page.locator("#preview").click();
  await expect(page.locator(".output")).toHaveText("Hello Alex.");
  await page.locator("#finish").click();
  await expect(page.locator("#app")).toContainText(
    "Session values have been cleared.",
  );
});

test("email checklist distinguishes manual advancement, copying, requested paste, and uncertain paste", async ({
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
        '\nbindShortcuts=async(bindings,dispatch)=>{window.__dispatch=dispatch;window.__bindings=bindings;}; platform.deliver=async()=>{if(window.__failPaste)throw Error("emailPasteFailed")};',
    });
  });
  await page.goto("/");
  await page.locator("#nav-templates").click();
  await page.locator("#email-subject").fill("Update");
  await page.locator("#email-to").fill("alex@example.test");
  await page.locator("#template-content").fill("Hello");
  await page.locator("#start").click();
  await page.locator("#finish").click();
  await page.locator("#email-copy").click();
  await expect(page.locator(".email-checklist li").nth(0)).toContainText(
    "Copied to clipboard",
  );
  await page.locator("#email-next").click();
  await expect(page.locator(".task-receipt")).toContainText(
    "Advanced manually",
  );
  await page.evaluate(() => {
    (window as any).__failPaste = true;
    (window as any).__dispatch("finish");
  });
  await expect(page.locator("#notice")).toContainText(
    "Paste or navigation could not be confirmed",
  );
  await expect(page.locator(".email-checklist li").nth(1)).toContainText(
    "Paste uncertain",
  );
  await expect(page.locator(".email-checklist li").nth(1)).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.evaluate(() => {
    (window as any).__failPaste = false;
    (window as any).__dispatch("finish");
  });
  await expect(page.locator(".email-checklist li").nth(1)).toContainText(
    "Paste requested; destination not checked",
  );
  await page.locator("#email-next").click();
  await expect(page.locator(".email-checklist li").nth(2)).toContainText(
    "paste not confirmed",
  );
  await page.locator("#pause-task").click();
  await page.locator("#resume-task").click();
  await expect(page.locator(".email-checklist li").nth(2)).toContainText(
    "paste not confirmed",
  );
});

for (const chinese of [false, true])
  test(`focused view wraps long comparison text at 300px and is accessible (Chinese=${chinese})`, async ({
    page,
  }) => {
    await page.goto("/");
    if (chinese) {
      await page.locator("#nav-settings").click();
      await page.locator("#language").selectOption("zh-CN");
      await page.locator("#theme").selectOption("DARK");
      await page.locator("#save-settings").click();
    }
    await page.locator("#nav-scanner").click();
    await page.locator("#start-scanner").click();
    await page.locator("#dialog-fields").fill("Reference");
    await page.getByRole("dialog").locator('button[type="submit"]').click();
    await page.setViewportSize({ width: 300, height: 740 });
    const value =
      "LongValue".repeat(70) + " ".repeat(180) + "\n地址".repeat(50);
    await fill(page, value);
    await page.locator("#verify-start").click();
    await fill(page, value + "wrong");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(300);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });

test("paused sessions suspend shortcuts and source tracking, block updates/quit, and can resume after a shortcut conflict", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
      bindShortcuts=async(bindings,dispatch)=>{window.__dispatch=dispatch; if(bindings && window.__conflict)throw Error("shortcutFailed");window.__bindings=bindings;};
      platform.mouseSource=async enabled=>{window.__source=enabled;return false};
      platform.tray=async callback=>{window.__tray=callback};
      platform.checkUpdate=async()=>{window.__updateCheck=true;return null};
    `,
    });
  });
  await scanner(page, "Reference");
  await fill(page, "AB-104");
  await page.locator("#verify-start").click();
  await page.locator("#manual-value").fill("AB-1O4 unfinished");
  await page.locator("#pause-task").click();
  expect(await page.evaluate(() => (window as any).__bindings)).toBeNull();
  await expect
    .poll(() => page.evaluate(() => (window as any).__source))
    .toBe(false);
  await page.evaluate(() => (window as any).__dispatch("clear"));
  await page.locator("#nav-settings").click();
  await page.locator("#update-app").click();
  await expect(page.locator("#notice")).toContainText(
    "Finish or cancel your session",
  );
  expect(
    await page.evaluate(() => (window as any).__updateCheck),
  ).toBeUndefined();
  await page.evaluate(() => (window as any).__tray("quit"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep working" })
    .click();
  await page.evaluate(() => ((window as any).__conflict = true));
  await page.locator("#resume-task").click();
  await expect(page.locator("#notice")).toContainText("A shortcut is invalid");
  await expect(page.locator(".active-value")).toHaveText("AB-104");
  await expect(page.locator("#manual-value")).toHaveValue("AB-1O4 unfinished");
  await expect(page.locator("#apply-value")).toHaveText("Compare value");
  await fill(page, "AB-104");
  await expect(page.locator(".active-status")).toHaveText("Matched source");
});

test("focused keyboard field paste and copy preserve other fields’ unfinished manual drafts", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await scanner(page);
  await page.locator("#manual-value").fill("unfinished name");
  await page.evaluate(() => navigator.clipboard.writeText("AB-104"));
  await page.locator("#field-1").focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+V" : "Control+V",
  );
  await expect(page.locator("#field-1 .field-value")).toHaveText("AB-104");
  await expect(page.locator("#manual-value")).toHaveValue("unfinished name");
  await fill(page, "Alex Example");
  await page.locator("#field-0").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#field-1")).toBeFocused();
  await page.locator("#verify-start").click();
  await fill(page, "AB-104");
  await page.locator("#field-1").focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+C" : "Control+C",
  );
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("AB-104");
});
