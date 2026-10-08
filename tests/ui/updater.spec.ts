import { test, expect, type Page } from "@playwright/test";
async function updates(page: Page, result: string, install = "") {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body:
        body +
        `\nplatform.checkUpdate = async () => { ${result} };\nplatform.installUpdate = async (progress) => { window.__updateInstalls = (window.__updateInstalls || 0) + 1; ${install} };\n`,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}
test("checking an up-to-date app does not install or prompt", async ({
  page,
}) => {
  await updates(page, "return null;");
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await expect(
    page.getByText("You’re using the latest available version."),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__updateInstalls || 0)).toBe(
    0,
  );
});
test("an available update shows version and literal notes and can be declined", async ({
  page,
}) => {
  await updates(
    page,
    'return { version: "0.6.0", notes: "<img src=x onerror=alert(1)>" };',
  );
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("VeraFlow 0.6.0");
  await expect(page.getByRole("dialog")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Keep working", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__updateInstalls || 0)).toBe(
    0,
  );
});
test("installation requires confirmation and reports verification errors without retrying", async ({
  page,
}) => {
  await updates(
    page,
    'return { version: "0.6.0", notes: "Test update" };',
    'progress({stage:"downloading",downloaded:10,total:100}); throw Error("updateDownloadFailed");',
  );
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Update now", exact: true })
    .click();
  await expect(page.getByText(/Nothing was installed/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__updateInstalls || 0)).toBe(
    1,
  );
});
test("unsaved changes and active sessions block the updater", async ({
  page,
}) => {
  await updates(page, 'throw Error("updateCheckFailed");');
  await page
    .getByLabel("Keep capture window on top", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await expect(page.getByText(/Finish or cancel your session/)).toBeVisible();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await expect(page.getByText(/Finish or cancel your session/)).toBeVisible();
});
test("network failure is recoverable and successful installation shows restart status", async ({
  page,
}) => {
  await updates(page, 'throw Error("updateCheckFailed");');
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await expect(page.getByText(/Could not check for updates/)).toBeVisible();
  await page.unrouteAll();
  await updates(
    page,
    'return {version:"0.6.0",notes:"Test"};',
    'progress({stage:"installing"});',
  );
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Update now", exact: true })
    .click();
  await expect(
    page.getByText("Installing update. VeraFlow will restart…"),
  ).toBeVisible();
});

test("declining an available update keeps a main-page Update now action", async ({
  page,
}) => {
  await updates(page, 'return {version:"0.6.0",notes:"Test"};');
  await page.getByRole("button", { name: "Update app…", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Update now", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("VeraFlow 0.6.0");
  expect(await page.evaluate(() => (window as any).__updateInstalls || 0)).toBe(
    0,
  );
});

test("a background update check preserves edits and does not open a dialog", async ({
  page,
}) => {
  await page.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\nwindow.__checkAvailableUpdate=checkAvailableUpdate;`,
    });
  });
  await updates(page, 'return {version:"0.6.0",notes:"Test"};');
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByLabel("Template text", { exact: true })
    .fill("Unsaved {{reference}}");
  await page.evaluate(() => (window as any).__checkAvailableUpdate());
  await expect(page.getByLabel("Template text", { exact: true })).toHaveValue(
    "Unsaved {{reference}}",
  );
  await expect(
    page.getByRole("button", { name: "Update now", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Update now", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "save or discard changes",
  );
  expect(await page.evaluate(() => (window as any).__updateInstalls || 0)).toBe(
    0,
  );
});
