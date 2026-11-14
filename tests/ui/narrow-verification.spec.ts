import { test, expect } from "@playwright/test";
import { defineScanner } from "./fixtures";
for (const scanner of [true, false])
  for (const width of [300, 360])
    test(`${scanner ? "Scanner" : "Template"} verification wraps at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/?workflow=classic");
      if (scanner) {
        await page
          .getByRole("button", { name: "Free Scanner", exact: true })
          .click();
        await defineScanner(page);
      } else {
        await page.locator("#nav-templates").click();
        await page.locator("#email-enabled").uncheck();
        await page.locator("#template-content").fill("{{field}}");
        await page.locator("#start").click();
        await page.getByText("Enter value manually", { exact: true }).click();
      }
      const value =
        "LongValue".repeat(70) +
        "\t" +
        " ".repeat(180) +
        "\n" +
        "地址".repeat(100);

      const fill = async (v: string) => {
        await page.locator("#manual-value").fill(v);
        await page.locator("#apply-value").click();
      };
      await fill(value);
      await page.locator("#verify-start").click();
      await fill(value + "wrong");
      await expect(page.locator(".mismatch-box")).toBeVisible();
      await page.locator(".inspect summary").click();
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("body *")]
          .filter(
            (e) =>
              e.clientWidth > 0 &&
              e.scrollWidth > e.clientWidth + 1 &&
              getComputedStyle(e).overflowX !== "hidden",
          )
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            w: e.clientWidth,
            scroll: e.scrollWidth,
          })),
      );
      expect(overflow).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await fill(value);
      await expect(page.locator(".capture-field.verified")).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
