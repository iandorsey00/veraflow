import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const url = process.env.PORTFOLIO_URL || "http://127.0.0.1:1420";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Portfolio captures require a local preview.");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await mkdir("docs/portfolio/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/portfolio/screenshots/01-template-library.png",
  });
  await page.locator("#email-enabled").uncheck();
  await page
    .getByLabel("Placeholder syntax", { exact: true })
    .selectOption("braces");
  await page.getByLabel("Template name", { exact: true }).waitFor();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Project update");
  await page
    .getByRole("textbox", { name: "Folder", exact: true })
    .fill("General");
  await page
    .getByLabel("Template text", { exact: true })
    .fill(
      "Subject: {{project_name}} update\n\nHello {{recipient}},\n\n{{summary}}\n\nReference: {{reference}}\n\nThank you!",
    );
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await mkdir("docs/portfolio/screenshots", { recursive: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Green background for verified fields", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.getByText("Enter value manually", { exact: true }).click();
  await page.setViewportSize({ width: 440, height: 920 });
  for (const value of [
    "Website refresh",
    "Alex",
    "The draft is ready for review.",
    "PR-104",
  ]) {
    await page.getByLabel("Paste or type a value").fill(value);
    await page
      .getByRole("button", { name: "Capture value", exact: true })
      .click();
  }
  for (const value of [
    "Website refresh",
    "Alex",
    "The draft is ready for review.",
    "PR-1O4",
  ]) {
    await page.getByLabel("Paste or type a value").fill(value);
    await page
      .getByRole("button", { name: "Compare value", exact: true })
      .click();
  }
  await page.getByRole("heading", { name: "! Mismatch" }).waitFor();
  await page.screenshot({
    path: "docs/portfolio/screenshots/02-verification-mismatch.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.setViewportSize({ width: 1040, height: 1000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByLabel("Appearance", { exact: true }).selectOption("DARK");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByRole("button", { name: "模板", exact: true }).click();
  await page.getByRole("button", { name: /通用邮件/ }).click();
  await page.locator("#email-enabled").uncheck();
  await page.locator("#placeholder-style").selectOption("braces");
  await page.getByLabel("模板名称", { exact: true }).fill("项目更新");
  await page.getByRole("textbox", { name: "文件夹", exact: true }).fill("通用");
  await page
    .getByLabel("模板内容", { exact: true })
    .fill(
      "主题：{{项目名称}}进展\n\n您好，{{收件人}}：\n\n{{进展摘要}}\n\n参考编号：{{参考编号}}\n\n谢谢！",
    );
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await page.getByRole("button", { name: "模板", exact: true }).click();
  await page.screenshot({
    path: "docs/portfolio/screenshots/03-chinese-dark.png",
  });
  const emailPage = await context.newPage();
  await emailPage.setViewportSize({ width: 1440, height: 1900 });
  await emailPage.goto(url);
  await emailPage
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await emailPage.locator("#email-enabled").uncheck();
  await emailPage
    .getByLabel("Placeholder syntax", { exact: true })
    .selectOption("braces");
  await emailPage
    .getByLabel("Template name", { exact: true })
    .fill("Project email");
  await emailPage
    .getByLabel("Template text", { exact: true })
    .fill("Hello {{recipient}},\n\n{{summary}}\n\nThank you!");
  await emailPage.getByLabel("Email mode", { exact: true }).check();
  await emailPage
    .getByLabel("Subject", { exact: true })
    .fill("{{project_name}} update");
  await emailPage.getByLabel("To", { exact: true }).fill("{{recipient_email}}");
  await emailPage.getByLabel("Include Cc", { exact: true }).check();
  await emailPage.getByLabel("Cc", { exact: true }).fill("{{team_email}}");
  await emailPage
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await emailPage
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await emailPage.screenshot({
    path: "docs/portfolio/screenshots/04-email-template.png",
    fullPage: false,
  });
  await emailPage.getByLabel("Include Subject", { exact: true }).uncheck();
  await emailPage.getByLabel("To", { exact: true }).fill("alex@example.test");
  await emailPage.getByLabel("Cc", { exact: true }).fill("team@example.test");
  await emailPage
    .getByLabel("Body", { exact: true })
    .fill(
      "Hello Alex,\n\nThe project update is ready for review.\n\nThank you!",
    );
  await emailPage
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await emailPage
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await emailPage
    .getByRole("button", { name: "Prepare email output", exact: true })
    .click();
  await emailPage.setViewportSize({ width: 440, height: 650 });
  await emailPage.screenshot({
    path: "docs/portfolio/screenshots/05-email-delivery.png",
    fullPage: true,
  });
  const scannerPage = await context.newPage();
  await scannerPage.setViewportSize({ width: 440, height: 900 });
  await scannerPage.goto(url);
  await scannerPage
    .getByRole("button", { name: "Free Scanner", exact: true })
    .click();
  await scannerPage.locator("#start-scanner").click();
  await scannerPage.locator("#dialog-fields").fill("reference");
  await scannerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  await expect(scannerPage.locator("#app")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await scannerPage.getByLabel("Paste or type a value").fill("PR-104");
  await scannerPage.locator("#apply-value").click();
  await scannerPage.locator("#verify-start").click();
  await scannerPage.getByLabel("Paste or type a value").fill("PR-104");
  await scannerPage.locator("#apply-value").click();
  await scannerPage.screenshot({
    path: "docs/portfolio/screenshots/06-scanner.png",
    fullPage: true,
  });
  const workspacePage = await context.newPage();
  await workspacePage.goto(url);
  await workspacePage
    .getByRole("button", { name: "Create table", exact: true })
    .click();
  await workspacePage.locator("#dialog-name").fill("Travel bookings");
  await workspacePage
    .locator("#dialog-fields")
    .fill("reference\ntraveler\ndestination");
  await workspacePage
    .locator("#dialog-output")
    .fill("Booking {{reference}} for {{traveler}} — {{destination}}");
  await workspacePage
    .getByRole("dialog")
    .getByRole("button", { name: "Save table", exact: true })
    .click();
  await workspacePage
    .getByRole("button", { name: "New row", exact: true })
    .click();
  await workspacePage.locator("#dialog-title").fill("Example trip");
  await workspacePage
    .getByRole("dialog")
    .getByRole("button", { name: "Create row", exact: true })
    .click();
  for (const value of ["AB-104", "Alex Morgan", "Example City"]) {
    await workspacePage.locator("#manual-value").fill(value);
    await workspacePage.locator("#apply-value").click();
    await expect(workspacePage.locator("#app")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
  }
  await workspacePage.locator("#scanner-save-row").click();
  await workspacePage.locator("#session-back").click();
  await workspacePage.screenshot({
    path: "docs/portfolio/screenshots/07-workspace.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
