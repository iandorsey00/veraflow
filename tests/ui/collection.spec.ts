import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fillEmployment } from "../../examples/source/collection/destination-adapter";
import { createCollectionResponse } from "../../src/core/collection";
import { readReviewedRecord } from "../../src/core/interoperability";

const fixture = (name: string) =>
  readFile(
    new URL(`../../examples/source/collection/${name}`, import.meta.url),
    "utf8",
  );
const fixturePath = (name: string) =>
  fileURLToPath(
    new URL(`../../examples/source/collection/${name}`, import.meta.url),
  );

async function openTools(page: Page) {
  const tools = page.locator("#source-form-tools");
  if (!(await tools.evaluate((node: HTMLDetailsElement) => node.open)))
    await tools.locator("summary").click();
  await page.getByRole("button", { name: "Record tools…" }).click();
}

async function supplyFile(
  page: Page,
  action: string,
  name: string,
  text: string,
) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: action, exact: true }).click();
  await (
    await picker
  ).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

async function verifyTitle(page: Page, value: string) {
  await page
    .getByRole("button", { name: "Verify field · 职位", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#dialog-original").fill(value);
  await dialog.getByRole("button", { name: "Compare value" }).click();
  await expect(
    page.getByRole("button", { name: "Verify again · 职位", exact: true }),
  ).toBeVisible();
}

test("review a collection response and transformations, approve locally, then populate and read back the synthetic destination", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page.locator("#open-document").click();
  const mapped = execFileSync(process.execPath, [
    fileURLToPath(new URL("../../scripts/veraflow", import.meta.url)),
    "map",
    fixturePath("veradata-selection.json"),
    fixturePath("veradata-mapping.json"),
    "--form",
    fixturePath("employment.vf"),
  ]);
  await (
    await picker
  ).setFiles({
    name: "employment.vf",
    mimeType: "text/plain",
    buffer: mapped,
  });
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue(
    "Xiaoming Example",
  );
  await expect(page.getByLabel("用人单位", { exact: true })).toHaveValue(
    "Juniper Example Labs",
  );

  await openTools(page);
  await page.setViewportSize({ width: 360, height: 690 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Review and approve record…" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Collect missing information…" })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("pre")).not.toContainText("Xiaoming Example");
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Save record and export request" })
    .click();
  const request = JSON.parse(
    await readFile((await (await downloaded).path())!, "utf8"),
  );
  expect(request.questions.map(({ id }: { id: string }) => id)).toEqual([
    "job_title",
    "comments",
  ]);
  const response = createCollectionResponse(
    request,
    new Map(Object.entries(JSON.parse(await fixture("answers.json")))),
  );
  await page
    .getByRole("button", { name: "Close session", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Close without saving", exact: true })
    .click();
  await page.locator("[data-recent]").click();

  await openTools(page);
  await supplyFile(
    page,
    "Import collection response…",
    "response.json",
    JSON.stringify(response),
  );
  await expect(dialog).toContainText("软件架构师");
  await dialog.getByRole("button", { name: "Apply selected values" }).click();
  await expect(page.getByLabel("职位", { exact: true })).toHaveValue(
    "软件架构师",
  );
  await verifyTitle(page, "软件架构师");

  await openTools(page);
  await supplyFile(
    page,
    "Review transformations…",
    "translation.json",
    await fixture("translation.json"),
  );
  await expect(dialog).toContainText("可以远程办公。");
  for (const box of await dialog.getByRole("checkbox").all()) await box.check();
  await dialog.getByRole("button", { name: "Apply selected values" }).click();
  await expect(page.getByLabel("职位", { exact: true })).toHaveValue(
    "Software Architect",
  );
  await expect(
    page.getByRole("button", { name: "Verify field · 职位", exact: true }),
  ).toBeVisible();
  await verifyTitle(page, "Software Architect");

  await openTools(page);
  await page
    .getByRole("button", { name: "Review and approve record…" })
    .click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(dialog).toContainText("Available to work remotely.");
  const exported = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Approve and export" }).click();
  const text = await readFile((await (await exported).path())!, "utf8");
  const reviewed = await readReviewedRecord(text);
  expect(reviewed.approval).toMatchObject({
    fingerprint: reviewed.fingerprint,
  });
  expect(reviewed.history).toMatchObject({
    comments: {
      origin: { source: "collection", requestId: request.requestId },
      transformations: [
        { from: "可以远程办公。", to: "Available to work remotely." },
      ],
    },
  });

  await page.goto("/examples/source/collection/destination.html");
  expect(
    await fillEmployment(page, reviewed.fields as Record<string, unknown>),
  ).toEqual({
    checked: [
      "full_name",
      "employment_status",
      "employer",
      "job_title",
      "comments",
    ],
    mismatches: [],
  });
  await expect(page.locator("[data-branch=self_employed]")).toBeHidden();
  await expect(page.locator("#submission")).toBeEmpty();
});
