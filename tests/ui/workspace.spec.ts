import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function createTable(page: Page, fields = "reference\naddress") {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your tables", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await page.locator("#dialog-name").fill("Bookings");
  await page.locator("#dialog-fields").fill(fields);
  await page.locator("#dialog-output").fill("Booking {{reference}}");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save table", exact: true })
    .click();
  await expect(page.locator(".workspace-content h1")).toHaveText("Bookings");
}
async function addRow(page: Page) {
  await page.getByRole("button", { name: "New row", exact: true }).click();
  await page.locator("#dialog-title").fill("Trip 104");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create row", exact: true })
    .click();
  await expect(page.locator("#scanner-save-row")).toBeVisible();
}
async function fill(page: Page, value: string) {
  await page.locator("#manual-value").fill(value);
  await page.locator("#apply-value").click();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
test("saved table row reopens with fresh verification, stable IDs and locally retained values", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await createTable(page);
  await addRow(page);
  const id = await page.locator(".capture-panel .vera-id").innerText();
  await fill(page, "AB-104");
  await fill(page, "One\nTwo");
  await page.locator("#scanner-save-row").click();
  await page.locator("#session-back").click();
  await expect(page.locator(".data-table")).toContainText("AB-104");
  await page.getByRole("button", { name: "Open Scanner", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Erase session", exact: true })
    .click();
  await expect(page.locator(".capture-panel .vera-id")).toHaveText(id, {
    useInnerText: true,
  });
  await expect(page.locator(".capture-field.verified")).toHaveCount(0);
  await expect(page.locator(".field-value").first()).toHaveText("AB-104");
  await page.locator("#field-0").focus();
  await page.keyboard.press("Control+c");
  await expect(page.getByRole("alert")).toContainText("Verify this field");
  await page.locator("#verify-start").click();
  await fill(page, "AB-104");
  await page.locator("#field-0").focus();
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "AB-104",
  );
  await page.locator("#field-0").focus();
  await page.locator("#field-0").click({ button: "right" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Copy field", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "AB-104",
  );
  await page.locator("#field-0").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#field-1")).toBeFocused();
  // Focus can move into the list independently of its active capture field.
  await page.locator("#field-0").focus();
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "AB-104",
  );
  await page.locator("#field-1").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#field-0")).toBeFocused();
});
test("Scanner wraps long values and matches template names, offers missing fields, saves Free Scanner as row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 740 });
  await page.goto("/");
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page.locator("#dialog-fields").fill("reference\nreference");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  await expect(page.locator("#workspace-dialog-error")).toContainText(
    "unique field names",
  );
  await expect(page.locator("#dialog-fields")).toHaveValue(
    "reference\nreference",
  );
  await page.locator("#dialog-fields").fill("reference");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  await fill(page, "x".repeat(400));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".scanner-template-panel summary").click();
  await page
    .locator("#scanner-output-template")
    .fill("{{reference}} / {{booking}}");
  await expect(page.locator(".template-match .matched")).toContainText(
    "reference",
  );
  await expect(page.locator(".template-match .unmatched")).toContainText(
    "booking",
  );
  await page.locator("#scanner-add-missing").click();
  await expect(page.locator(".capture-field strong")).toHaveText([
    "reference",
    "booking",
  ]);
  await page.locator("#scanner-save-row").click();
  await page.locator("#dialog-table").fill("New trips");
  await page.locator("#dialog-title").fill("Trip 105");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save as new table row", exact: true })
    .click();
  await page.locator("#session-back").click();
  await expect(page.locator(".workspace-content")).toContainText("Trip 105");
});
test("workspace has accessible light and Chinese dark layouts, optional row titles and external IDs", async ({
  page,
}) => {
  await createTable(page);
  await page
    .getByRole("button", { name: "Table settings", exact: true })
    .click();
  await page.locator("#dialog-rowTitles").uncheck();
  await page.locator("#dialog-refs").fill("Booking system=AB-104");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save table", exact: true })
    .click();
  await expect(page.locator(".data-table th").first()).toHaveText(
    "VeraFlow ID",
  );
  await expect(page.locator(".workspace-content")).toContainText(
    "Booking system: AB-104",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.locator("#nav-settings").click();
  await page.locator("#language").selectOption("zh-CN");
  await page.locator("#theme").selectOption("DARK");
  await page.locator("#save-settings").click();
  await page.locator("#nav-workspace").click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("database export and import keep saved values and make independent copies on ID collisions", async ({
  page,
}) => {
  await createTable(page);
  await addRow(page);
  await fill(page, "AB-104");
  await page.locator("#scanner-save-row").click();
  await page.locator("#session-back").click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export database JSON", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Export JSON", exact: true })
    .click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  const json = await readFile((await file.path())!, "utf8");
  expect(JSON.parse(json).workspace.tables[0].rows[0].values.reference).toBe(
    "AB-104",
  );
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import database JSON", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "veraflow-database.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import JSON", exact: true })
    .click();
  await expect(page.locator('[data-workspace="select"]')).toHaveCount(2);
});
test("Scanner JSON import restores values as captured and field-only export omits values", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-scanner").click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#import-scanner-home").click();
  await (
    await chooser
  ).setFiles({
    name: "scanner.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "veraflow-scanner",
        version: 1,
        fields: [{ name: "reference", value: "AB-104" }],
        output: "{{reference}}",
      }),
    ),
  });
  await expect(page.locator(".field-value")).toHaveText("AB-104");
  await expect(page.locator(".capture-field")).toHaveClass(/captured/);
  await page.getByText("More tools", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.locator("#scanner-export-fields").click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  expect(
    JSON.parse(await readFile((await file.path())!, "utf8")).fields,
  ).toEqual([{ name: "reference" }]);
});
test("CSV header suggestion can be corrected before importing literal values", async ({
  page,
}) => {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "bookings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Full name,Booking reference\r\n"Alex, Morgan",=1+1\r\n',
    ),
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Use first row as headers")).toBeChecked();
  await expect(dialog.locator("#csv-sample")).toContainText("Alex, Morgan");
  await dialog.getByLabel("Use first row as headers").uncheck();
  await expect(dialog.locator("#csv-sample th").first()).toHaveText("Column 1");
  await dialog.getByLabel("Use first row as headers").check();
  await dialog.getByLabel("Table name", { exact: true }).fill("CSV bookings");
  await dialog
    .getByRole("button", { name: "Import table", exact: true })
    .click();
  await expect(page.locator(".data-table th")).toContainText([
    "Full name",
    "Booking reference",
  ]);
  await expect(page.locator(".data-table tbody")).toContainText("=1+1");
});
test("template-only setup infers spaced fields and Scanner fits a 300px window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 300, height: 740 });
  await page.goto("/");
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page
    .locator("#dialog-output")
    .fill("Booking {{ full name }} / {{booking reference}}");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start Scanner", exact: true })
    .click();
  await expect(page.locator(".capture-field strong")).toHaveText([
    "full name",
    "booking reference",
  ]);
  await fill(page, "x".repeat(200));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("More tools", { exact: true }).click();
  await expect(page.locator(".template-match .matched")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
