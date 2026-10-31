// Synthetic browser-preview documentation only; never reads the desktop library.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const url = process.env.PORTFOLIO_URL || "http://127.0.0.1:1420";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Focused captures require a local preview.");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 850 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page
    .locator("#dialog-fields")
    .fill("Passenger name\nBooking reference\nDeparture date");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  for (const text of ["Alex Example", "AB-104"]) {
    await page.locator("#manual-value").fill(text);
    await page.locator("#apply-value").click();
  }
  await page.locator("#field-1").click();
  await page.locator("#verify-start").click();
  await page.locator("#manual-value").fill("AB-104");
  await page.locator("#apply-value").click();
  await expect(page.locator(".active-status")).toHaveText("Matched source");
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir("docs/portfolio/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/portfolio/screenshots/10-focused-scanner.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
