import { chromium } from "@playwright/test";
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
  await page.getByLabel("Template name", { exact: true }).waitFor();
  await mkdir("docs/portfolio/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/portfolio/screenshots/01-template-library.png",
  });
  await page
    .getByLabel("Template text", { exact: true })
    .fill(
      "Subject: [RMA] [<ticket_number>] <title>\n\nPlease ship <qty> <model_number>.\n\nThank you!",
    );
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.getByText("Enter value manually", { exact: true }).click();
  await page.setViewportSize({ width: 440, height: 920 });
  for (const value of ["483921", "Display won’t power on", "2", "UC-P10"]) {
    await page.getByLabel("Paste or type a value").fill(value);
    await page
      .getByRole("button", { name: "Capture value", exact: true })
      .click();
  }
  for (const value of ["483921", "Display won’t power on", "2", "UC-P1O"]) {
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
  await page.setViewportSize({ width: 1040, height: 900 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByLabel("Appearance", { exact: true }).selectOption("DARK");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByRole("button", { name: "模板", exact: true }).click();
  await page.getByRole("button", { name: /客户跟进/ }).click();
  await page.getByLabel("模板名称", { exact: true }).waitFor();
  await page.screenshot({
    path: "docs/portfolio/screenshots/03-chinese-dark.png",
  });
} finally {
  await browser.close();
}
