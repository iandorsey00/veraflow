import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
// Chromium's Windows clipboard bridge normalizes LF to CRLF. Compare logical
// lines without changing stored/exported text or masking extra line breaks.
async function clipboardText(page: Page) {
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(
    /\r\n/g,
    "\n",
  );
}
async function table(page: Page, name = "Trips") {
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await page.locator("#dialog-name").fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save table", exact: true })
    .click();
  await expect(page.locator(".workspace-content h1")).toHaveText(name);
  await page.locator("#table-snippets > summary").click();
}
async function snippet(page: Page, title: string, content: string) {
  await page.getByRole("button", { name: "New snippet", exact: true }).click();
  await page.locator("#dialog-title").fill(title);
  await page.locator("#dialog-content").fill(content);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save snippet", exact: true })
    .click();
  await expect(page.locator(".snippet-card h3").last()).toHaveText(title);
}
test("titled table snippets copy literal text, move to Unfiled, edit and return to a table", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await table(page);
  const id = await page.locator(".workspace-content > .vera-id").innerText();
  const text =
    "Hello {{not a field}}\n<joe@example.test>\n<script>alert(1)</script>";
  await snippet(page, "Confirmation", text);
  await page.locator("[data-snippet-action=copy]").click();
  await expect.poll(() => clipboardText(page)).toBe(text);
  await expect(page.locator(".capture-panel")).toHaveCount(0);
  await page.locator("[data-snippet-action=move]").click();
  await page.locator("#dialog-tableId").selectOption("");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move snippet", exact: true })
    .click();
  await expect(page.locator(".snippet-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Unfiled snippets", exact: true })
    .click();
  await expect(page.locator(".snippet-card h3")).toHaveText("Confirmation");
  await page.locator("[data-snippet-action=edit]").click();
  await page.locator("#dialog-title").fill("Arrival instructions");
  await page.locator("#dialog-tableId").selectOption(id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save snippet", exact: true })
    .click();
  await expect(page.locator(".snippet-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await expect(page.locator(".snippet-card h3")).toHaveText(
    "Arrival instructions",
  );
  await expect(page.locator(".snippet-card pre")).toHaveText(text);
  await page.locator("#nav-settings").click();
  await page.locator("#nav-workspace").click();
  await expect(page.locator(".snippet-card h3")).toHaveText(
    "Arrival instructions",
  );
});
test("snippet title/text validation stays editable and deletion/table removal preserve expected scopes", async ({
  page,
}) => {
  await page.goto("/");
  await table(page);
  await page.getByRole("button", { name: "New snippet", exact: true }).click();
  await page.locator("#dialog-content").fill("Saved text");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save snippet", exact: true })
    .click();
  await expect(page.locator("#workspace-dialog-error")).toContainText(
    "Enter a title",
  );
  await page.locator("#dialog-title").fill("Thank you");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save snippet", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete table", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete table", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unfiled snippets", exact: true })
    .click();
  await expect(page.locator(".snippet-card h3")).toHaveText("Thank you");
  await page.locator("[data-snippet-action=delete]").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await expect(page.locator(".snippet-card")).toHaveCount(1);
  await page.locator("[data-snippet-action=delete]").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete snippet", exact: true })
    .click();
  await expect(page.locator(".snippet-card")).toHaveCount(0);
});
test("snippet-only/table/database JSON export and import include proper scope and independent copies", async ({
  page,
}) => {
  await page.goto("/");
  await table(page);
  await snippet(page, "Table note", "Literal {{reference}}");
  const download = async (button: string) => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name:
          button === "Export snippets JSON" ? "Export snippets" : "Export JSON",
        exact: true,
      })
      .click();
    return await pending;
  };
  const one = await download("Export snippets JSON");
  const source = (await one.path())!;
  const archive = JSON.parse(await readFile(source, "utf8"));
  expect(archive.snippets).toEqual([
    { title: "Table note", content: "Literal {{reference}}" },
  ]);
  await page
    .getByRole("button", { name: "Unfiled snippets", exact: true })
    .click();
  await snippet(page, "Global note", "Thank you.");
  const choose = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import snippets JSON", exact: true })
    .click();
  await (await choose).setFiles(source);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import snippets", exact: true })
    .click();
  await expect(page.locator(".snippet-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  const tableFile = await download("Export table JSON");
  const t = JSON.parse(await readFile((await tableFile.path())!, "utf8"));
  expect(t.workspace.snippets).toHaveLength(1);
  expect(t.workspace.snippets[0].title).toBe("Table note");
  const database = await download("Export database JSON");
  const db = JSON.parse(await readFile((await database.path())!, "utf8"));
  expect(db.workspace.snippets).toHaveLength(3);
  const ids = await page
    .locator(".snippet-card")
    .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.snippet));
  await page
    .getByRole("button", { name: "Unfiled snippets", exact: true })
    .click();
  expect(
    await page
      .locator(".snippet-card")
      .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.snippet)),
  ).not.toContain(ids[0]);
});
test("malformed snippets do not import and snippet paste sends literal text only on explicit request", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const r = await route.fetch();
    await route.fulfill({
      response: r,
      body:
        (await r.text()) +
        "\nplatform.pasteToSource=async text=>{if(window.__failSnippetPaste)throw Error('sourceFocus');window.__snippetPaste=text;};",
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Unfiled snippets", exact: true })
    .click();
  await snippet(page, "Paste me", "{{literal}}\nThank you.");
  expect(
    await page.evaluate(() => (window as any).__snippetPaste),
  ).toBeUndefined();
  await page
    .locator("[data-snippet-action=paste]")
    .evaluate((el: HTMLButtonElement) => {
      el.disabled = false;
      el.click();
    });
  await expect
    .poll(() => page.evaluate(() => (window as any).__snippetPaste))
    .toBe("{{literal}}\nThank you.");
  await page.evaluate(() => ((window as any).__failSnippetPaste = true));
  await page
    .locator("[data-snippet-action=paste]")
    .evaluate((el: HTMLButtonElement) => {
      el.disabled = false;
      el.click();
    });
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.locator(".snippet-card pre")).toHaveText(
    "{{literal}}\nThank you.",
  );
  const choose = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import snippets JSON", exact: true })
    .click();
  await (
    await choose
  ).setFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"other"}'),
  });
  await expect(page.getByRole("alert").first()).toContainText("snippets JSON");
  await expect(page.locator(".snippet-card")).toHaveCount(1);
});
for (const chinese of [false, true])
  test(`snippets accessible and wrap narrow text (Chinese=${chinese})`, async ({
    page,
  }) => {
    await page.goto("/");
    if (chinese) {
      await page.locator("#nav-settings").click();
      await page.locator("#language").selectOption("zh-CN");
      await page.locator("#theme").selectOption("DARK");
      await page.locator("#save-settings").click();
      await page.locator("#nav-workspace").click();
    }
    await page
      .getByRole("button", {
        name: chinese ? "未归档片段" : "Unfiled snippets",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: chinese ? "新建片段" : "New snippet",
        exact: true,
      })
      .click();
    await page
      .locator("#dialog-title")
      .fill(chinese ? "确认信息" : "Confirmation");
    await page.locator("#dialog-content").fill("LongText".repeat(60));
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: chinese ? "保存片段" : "Save snippet",
        exact: true,
      })
      .click();
    await page.setViewportSize({ width: 360, height: 740 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });

test("selecting a snippet supports Ctrl/Cmd+C transfer and leaves Ctrl/Cmd+V unchanged", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Unfiled snippets", exact: true })
    .click();
  const text = "Literal {{message}}\nThank you.";
  await snippet(page, "Thank you", text);
  await page.locator(".snippet-card h3").click();
  await expect(page.locator(".snippet-card")).toBeFocused();
  await expect(page.locator(".snippet-card")).toHaveAttribute(
    "aria-current",
    "true",
  );
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.evaluate(() => navigator.clipboard.writeText("old"));
  await page.keyboard.press(`${modifier}+V`);
  await expect.poll(() => clipboardText(page)).toBe("old");
  await expect(page.locator(".snippet-card")).toBeFocused();
  await page.evaluate(() => navigator.clipboard.writeText("old"));
  await page.keyboard.press(`${modifier}+C`);
  await expect.poll(() => clipboardText(page)).toBe(text);
  await page
    .getByRole("button", { name: "Transfer to clipboard", exact: true })
    .click();
  await expect.poll(() => clipboardText(page)).toBe(text);
  await page.locator(".snippet-preview").evaluate((el) => {
    const range = document.createRange();
    range.setStart(el.firstChild!, 0);
    range.setEnd(el.firstChild!, 7);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.keyboard.press(`${modifier}+C`);
  await expect.poll(() => clipboardText(page)).toBe("Literal");
  await page.evaluate(() => window.getSelection()!.removeAllRanges());
  await page.locator("[data-snippet-action=edit]").click();
  await page.locator("#dialog-content").fill("Prefix ");
  await page.locator("#dialog-content").press("End");
  await page.evaluate(() => navigator.clipboard.writeText("suffix"));
  await page.locator("#dialog-content").press(`${modifier}+V`);
  await expect(page.locator("#dialog-content")).toHaveValue("Prefix suffix");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await expect(page.locator(".snippet-card pre")).toHaveText(text);
});
