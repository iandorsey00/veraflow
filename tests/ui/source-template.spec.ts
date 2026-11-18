import { openLegacyLibrary } from "./fixtures";
import { test, expect, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = (name: string) =>
  readFile(new URL(`../../examples/source/${name}`, import.meta.url));

async function openSource(page: Page) {
  await openLegacyLibrary(page);
  const picker = page.waitForEvent("filechooser");
  await page.locator("#open-source").click();
  await (
    await picker
  ).setFiles({
    name: "rma.veraflow",
    mimeType: "text/plain",
    buffer: await fixture("rma.veraflow"),
  });
  await expect(page.locator("#template-content")).toContainText("veraflow 2");
}
type TestWindow = Window & {
  vfDispatch: (action: string) => void;
  vfFailPaste: boolean;
  vfPastes: [string, boolean][];
};

test("source file fills from CSV and retains paste output for retry, grouping and text export", async ({
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
        `
      window.vfPastes=[];
      bindShortcuts=async(bindings,dispatch)=>{window.vfDispatch=dispatch};
      platform.deliver=async(text,tab)=>{
        if(window.vfFailPaste) throw Error("emailPasteFailed");
        window.vfPastes.push([text,tab]);
      };
    `,
    });
  });
  await page.goto("/");
  await openSource(page);
  const sourceDownload = page.waitForEvent("download");
  await page.locator("#export-source").click();
  expect(await readFile((await (await sourceDownload).path())!)).toEqual(
    await fixture("rma.veraflow"),
  );
  const picker = page.waitForEvent("filechooser");
  await page.locator("#source-csv").click();
  await (
    await picker
  ).setFiles({
    name: "rma.csv",
    mimeType: "text/csv",
    buffer: await fixture("rma.csv"),
  });
  await page.locator("#dialog-row").selectOption("1");
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await expect(
    page.getByLabel("Dead on arrival?", { exact: true }),
  ).toHaveValue("true");
  await expect(page.locator("#form-output")).toContainText("Attn: Receiving");
  await page.getByLabel("Attention", { exact: true }).fill("");
  await expect(page.locator("#form-output")).not.toContainText("Attn:");
  await page.locator("#finish").click();
  await expect(page.locator(".output")).toHaveText("review@example.test");
  await page.evaluate(() => {
    const bridge = window as unknown as TestWindow;
    bridge.vfFailPaste = true;
    bridge.vfDispatch("finish");
  });
  await expect(page.locator("#notice")).toBeVisible();
  await expect(page.locator(".output")).toHaveText("review@example.test");
  await page.locator("#copy-section").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("review@example.test");
  await page.evaluate(() => {
    const bridge = window as unknown as TestWindow;
    bridge.vfFailPaste = false;
    bridge.vfDispatch("finish");
  });
  await expect(page.locator(".output")).toHaveText(
    "[RMA] [DOA] [TKT-123457] Return",
  );
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).vfPastes),
  ).toEqual([["review@example.test", false]]);
  await page.locator("#paste-options summary").click();
  await page.locator("#group-sections").check();
  const expected =
    "review@example.test\n[RMA] [DOA] [TKT-123457] Return\n50 Sample Avenue\nSeattle, WA 98101";
  await expect(page.locator(".output")).toHaveJSProperty(
    "textContent",
    expected,
  );
  const output = page.waitForEvent("download");
  await page.locator("#save-sections").click();
  expect(await readFile((await (await output).path())!, "utf8")).toBe(expected);
  await page.locator("#section-edit").click();
  await expect(page.getByLabel("subject", { exact: true })).toHaveValue(
    "Return",
  );
});

test("live preview can be hidden while source forms remain editable", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-settings").click();
  await page.locator("#hideLivePreview").check();
  await page.locator("#focusedWorkflow").check();
  await page.locator("#save-settings").click();
  await openSource(page);
  await page.locator("#start-form").click();
  await page.getByLabel("Attention", { exact: true }).fill("Receiving");
  await expect(page.locator("#form-output")).toBeHidden();
  await expect(page.locator(".template-form .task-progress")).toBeVisible();
});

async function pickDocument(page: Page, name: string, text: string) {
  const picker = page.waitForEvent("filechooser");
  await page.locator("#open-document").click();
  await (
    await picker
  ).setFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
}

test("opens a source document in its declared mode and can switch modes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#nav-workspace")).toHaveCount(0);
  await pickDocument(
    page,
    "Greeting.veraflow",
    '--- veraflow 2\n{"workflow":"form"}\n---\n{{#output greeting "Greeting"}}\nHello {{name}}\n{{/output}}\n{{#output farewell "Farewell"}}\nBye {{name}}\n{{/output}}',
  );
  await page.getByLabel("name", { exact: true }).fill("Alex Example");
  const output = page.getByLabel("Output", { exact: true });
  await page
    .getByRole("button", { name: "Next output", exact: true })
    .press("Enter");
  await expect(output).toHaveValue("farewell");
  await page.locator("#switch-scanner").click();
  await expect(page.locator(".capture-field")).toContainText("Alex Example");
  await page
    .getByRole("button", { name: "Previous output", exact: true })
    .click();
  await expect(output).toHaveValue("greeting");
  await page.locator("#switch-form").click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue(
    "Alex Example",
  );
});

test("queues desktop open events and asks for a mode when the source omits one", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
        const documents = [
          { name: "first.vf", format: "source", content: "Hello {{name}}" },
          { name: "second.vf", format: "source", content:
            '--- veraflow 2\\n{"workflow":"scanner"}\\n---\\nID {{booking}}' },
        ];
        platform.documentEvents = async (ready) => ready();
        platform.takeDocument = async () => documents.shift() ?? null;
      `,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("dialog")).toContainText("first");
  await page.locator("#dialog-workflow").selectOption("form");
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Erase session" })
    .click();
  await expect(page.locator(".capture-field")).toContainText("booking");
  await expect(page.locator("#switch-form")).toBeVisible();
});

test("opens a CSV row in Free Scanner or fills a template from a file", async ({
  page,
}) => {
  await page.goto("/");
  const csv = "name,booking\nAlex Example,001\nDrew Example,002";
  await pickDocument(page, "Bookings.csv", csv);
  await page.locator("#dialog-row").selectOption("1");
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await expect(page.locator("#field-0")).toContainText("Drew Example");
  await expect(page.locator("#field-1")).toContainText("002");
  await page.locator("#session-back").click();
  await pickDocument(page, "Bookings.csv", csv);
  await page.locator("#dialog-template").selectOption("file");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await (
    await picker
  ).setFiles({
    name: "greeting.vf",
    mimeType: "text/plain",
    buffer: Buffer.from(
      '--- veraflow 2\n{"workflow":"form"}\n---\nHello {{name}}',
    ),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Erase session" })
    .click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue(
    "Alex Example",
  );
});

test("source labels and text layout follow the field into Scanner", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "Delivery.veraflow",
    `--- veraflow 2
{"workflow":"form","fields":{
  "ticket_id":{"type":"text","label":"Ticket #","default":"A-104"},
  "address":{"type":"text","label":"Ship to · full address","multiline":true,"allowBlankLines":false}
}}
---
{{ticket_id}}
{{address}}`,
  );
  const ticket = page.getByLabel("Ticket #", { exact: true });
  const address = page.getByLabel("Ship to · full address", { exact: true });
  await expect(ticket).toHaveAttribute("type", "text");
  await expect(ticket).toHaveValue("A-104");
  await expect(address).toHaveJSProperty("tagName", "TEXTAREA");
  await address.fill("100 Example Way\n\nExample City");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#form-state-1")).toContainText(
    "Remove blank lines",
  );
  await address.fill("100 Example Way\nExample City");
  await expect(address).not.toHaveAttribute("aria-invalid");
  await page.locator("#switch-scanner").click();
  await expect(page.locator("#field-0 strong")).toHaveText("Ticket #");
  await expect(page.locator("#field-1 strong")).toHaveText(
    "Ship to · full address",
  );
  await page.locator("#field-1").click();
  await expect(page.locator("#scanner-control")).toHaveJSProperty(
    "tagName",
    "TEXTAREA",
  );
});

test("saves incomplete responses as a file and reopens an editable copy", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(page, "Greeting.vf", "Hello {{name}} from {{place}}.");
  await page.locator("#dialog-workflow").selectOption("form");
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await page.getByLabel("name", { exact: true }).fill("Alex");
  await page.locator("#cancel-session").click();
  const dialog = page.getByRole("dialog", { name: "Save before closing?" });
  await expect(
    dialog.getByRole("button", { name: "Save output as text" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Alex");
  await page.locator("#cancel-session").click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save prefilled template" }).click();
  const snapshot = await download;
  expect(snapshot.suggestedFilename()).toMatch(
    /^.+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.veraflow$/,
  );
  await pickDocument(
    page,
    snapshot.suggestedFilename(),
    await readFile((await snapshot.path())!, "utf8"),
  );
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Alex");
  await expect(page.getByLabel("place", { exact: true })).toHaveValue("");
  await page.getByLabel("name", { exact: true }).fill("Drew");
  await page.getByLabel("place", { exact: true }).fill("Seattle");
  await page.locator("#finish").click();
  await expect(page.locator(".output")).toHaveText("Hello Drew from Seattle.");
  await page.locator("#cancel-session").click();
  const textDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save output as text" }).click();
  const output = await textDownload;
  expect(output.suggestedFilename()).toBe("veraflow-output.txt");
  expect(await readFile((await output.path())!, "utf8")).toBe(
    "Hello Drew from Seattle.",
  );
  await expect(page.locator("#nav-settings")).toBeVisible();
});

test("canceling a save leaves the source session open", async ({ page }) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        "\nplatform.exportTemplates = async () => false;",
    });
  });
  await page.goto("/");
  await pickDocument(
    page,
    "Greeting.vf",
    '--- veraflow 2\n{"workflow":"form"}\n---\nHello {{name}}',
  );
  await page.getByLabel("name", { exact: true }).fill("Alex");
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Save prefilled template" }).click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Alex");
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await expect(page.locator("#nav-settings")).toBeVisible();
});

async function mockSectionPaste(page: Page) {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
        window.vfPastes = [];
        bindShortcuts = async (_, dispatch) => { window.vfDispatch = dispatch; };
        platform.deliveryTarget = async () => "same-target";
        platform.deliver = async (text, keys, target) => {
          window.vfPastes.push([text, keys, target ?? null]);
          if (window.vfFailPaste && text === "Booking VF-104") throw Error("emailPasteFailed");
        };
      `,
    });
  });
}

test("explicit navigation works in step and sequence mode and failure retains the pending section", async ({
  page,
}) => {
  await mockSectionPaste(page);
  await page.goto("/");
  await pickDocument(
    page,
    "step-tabs.veraflow",
    (await fixture("step-tabs.veraflow")).toString(),
  );
  await page.locator("#finish").click();
  await expect(page.locator("#delivery-mode")).toHaveValue("step");
  const finish = () =>
    page.evaluate(() => (window as unknown as TestWindow).vfDispatch("finish"));
  await finish();
  await expect(page.locator(".output")).toHaveText("Booking VF-104");
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).vfPastes),
  ).toEqual([["alex@example.test", ["Tab", "Tab"], null]]);
  await page.locator("#paste-options summary").click();
  await page.locator("#delivery-mode").selectOption("sequence");
  await page.evaluate(() => {
    (window as unknown as TestWindow).vfFailPaste = true;
  });
  await finish();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".output")).toHaveText("Booking VF-104");
  await page.evaluate(() => {
    (window as unknown as TestWindow).vfFailPaste = false;
  });
  await finish();
  await expect(page.locator(".output")).toContainText("Your booking is ready");
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).vfPastes),
  ).toEqual([
    ["alex@example.test", ["Tab", "Tab"], null],
    ["Booking VF-104", ["Tab"], "same-target"],
    ["Booking VF-104", ["Tab"], "same-target"],
    [
      "Hello Alex Example,\nYour booking is ready for review.",
      false,
      "same-target",
    ],
  ]);
});

test("keyboard section reordering uses single-step paste without keys and keeps exports in template order", async ({
  page,
}) => {
  await mockSectionPaste(page);
  await page.goto("/");
  await pickDocument(
    page,
    "step-tabs.veraflow",
    (await fixture("step-tabs.veraflow")).toString(),
  );
  await page.locator("#finish").click();
  await page.locator("#paste-options summary").click();
  const mode = page.locator("#delivery-mode");
  await mode.selectOption("sequence");
  await page.locator("#section-tab").check();
  await page.getByRole("button", { name: "Reorder sections…" }).press("Enter");
  await page.getByRole("button", { name: "Move up Subject" }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Move down Subject" }),
  ).toBeFocused();
  const list = page.getByRole("list", { name: "Section paste order" });
  await expect(list.locator("li > span")).toHaveText([
    "Subject",
    "Recipient",
    "Body",
  ]);
  await expect(mode).toHaveValue("step");
  await expect(mode).toBeDisabled();
  await expect(page.locator("#section-tab")).toBeDisabled();
  await expect(page.locator("#section-tab")).not.toBeChecked();
  const output = page.locator(".output");
  await expect(output).toHaveText("Booking VF-104");
  await page.evaluate(() =>
    (window as unknown as TestWindow).vfDispatch("finish"),
  );
  await expect(output).toHaveText("alex@example.test");
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).vfPastes),
  ).toEqual([["Booking VF-104", false, null]]);
  await page.locator("#section-prev").click();
  await expect(output).toHaveText("Booking VF-104");

  const expected =
    "Recipient\nalex@example.test\n\nSubject\nBooking VF-104\n\nBody\nHello Alex Example,\nYour booking is ready for review.";
  const download = page.waitForEvent("download");
  await page.locator("#save-sections").click();
  expect(await readFile((await (await download).path())!, "utf8")).toBe(
    expected,
  );

  await page.getByRole("button", { name: "Reset to template order" }).click();
  await expect(list.locator("li > span")).toHaveText([
    "Recipient",
    "Subject",
    "Body",
  ]);
  await expect(output).toHaveText("alex@example.test");
  await expect(mode).toHaveValue("sequence");
  await expect(mode).toBeEnabled();
  await expect(page.locator("#section-tab")).toBeChecked();

  await page.getByRole("button", { name: "Move up Subject" }).click();
  await page.locator("#cancel-session").click();
  const closeDownload = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save output as text" })
    .click();
  expect(await readFile((await (await closeDownload).path())!, "utf8")).toBe(
    expected,
  );

  await pickDocument(
    page,
    "step-tabs.veraflow",
    (await fixture("step-tabs.veraflow")).toString(),
  );
  await page.locator("#finish").click();
  await expect(output).toHaveText("alex@example.test");
  await expect(mode).toHaveValue("step");
});

test("opens titled recent files and presents conditional choices before dependent fields", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Recently opened templates" }),
  ).toBeVisible();
  await pickDocument(
    page,
    "conditional-booking.vf",
    `--- veraflow 2
{"title":"Booking intake","workflow":"form","fields":{
 "name":{"type":"text","label":"Full name"},
 "route":{"type":"dropdown","label":"Route","options":[{"id":"normal","label":"Standard"},{"id":"express","label":"Express"}]}
}}
---
{{#when route=express}}
{{name}}
{{/when}}`,
  );
  await expect(
    page.getByRole("heading", { name: "Booking intake" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeHidden();
  await expect(page.getByRole("radio", { name: "Standard" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Express" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Full name")).toBeFocused();
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await page
    .getByRole("button", { name: /Booking intake.*conditional-booking/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Booking intake" }),
  ).toBeVisible();
});

test("CSV picker pages through rows and searches columns outside the row summary", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "large.csv",
    [
      "name,number,place,notes",
      ...Array.from(
        { length: 160 },
        (_, i) =>
          `Example,${i},Test City,${i === 143 ? "Unique search phrase" : "Ordinary"}`,
      ),
    ].join("\n"),
  );
  await expect(page.locator("#dialog-row-count")).toHaveText("1–75 / 160");
  await page.locator("#dialog-row-next").click();
  await expect(page.locator("#dialog-row-count")).toHaveText("76–150 / 160");
  await page.locator("#dialog-row-search").fill("no matches");
  const submit = page.getByRole("dialog").locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await page.locator("#dialog-row-search").fill("unique search");
  await expect(page.locator("#dialog-row-preview")).toContainText(
    "Unique search phrase",
  );
  await expect(page.locator("#dialog-row")).toHaveValue("143");
  await submit.click();
  await expect(page.locator("#field-3")).toContainText("Unique search phrase");
});

test("default Tab applies between sections and respects an explicit empty key list", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-settings").click();
  await page.locator("#tabBetweenSections").check();
  await page.locator("#save-settings").click();
  await page.locator("#nav-recent").click();
  await pickDocument(
    page,
    "tabs.vf",
    `--- veraflow 2
{"workflow":"form","delivery":{"after":{"first":[]}}}
---
{{#section first "First"}}
first
{{/section}}
{{#section second "Second"}}
second
{{/section}}
{{#section final "Final"}}
final
{{/section}}`,
  );
  await page.locator("#finish").click();
  await expect(page.locator("#section-tab")).toBeChecked();
  await expect(
    page.getByText("After this section No keystrokes"),
  ).toBeVisible();
  await page.locator("#section-next").click();
  await expect(page.getByText("After this section Tab")).toBeVisible();
  await page.locator("#cancel-session").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Save output as text" }),
  ).toBeEnabled();
});

test("recent outputs keep five transferred results, support copy, and clear when disabled", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  for (let number = 1; number <= 6; number++) {
    await pickDocument(
      page,
      `item-${number}.vf`,
      `--- veraflow 2\n{"workflow":"form","title":"Item ${number}"}\n---\nRendered output ${number}`,
    );
    await page.locator("#finish").click();
    await page.locator("#copy-section").click();
    await page.locator("#cancel-session").click();
    await page.getByRole("button", { name: "Close without saving" }).click();
  }
  await pickDocument(
    page,
    "draft.vf",
    '--- veraflow 2\n{"workflow":"form"}\n---\nDraft {{name}}',
  );
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await page.locator("#open-outputs").click();
  await expect(page.locator("[data-output] strong")).toHaveText([
    "Item 6",
    "Item 5",
    "Item 4",
    "Item 3",
    "Item 2",
  ]);
  await page.locator("#output-0").click();
  await expect(page.locator(".history-output")).toHaveText("Rendered output 6");
  await page.locator("#copy-history").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Rendered output 6");

  await page.locator("#nav-settings").click();
  await expect(page.locator("#outputHistoryLimit")).toHaveValue("5");
  await page.locator("#outputHistoryLimit").fill("0");
  await page.locator("#save-settings").click();
  await page.locator("#nav-recent").click();
  await page.locator("#open-outputs").click();
  await expect(page.locator("main")).toContainText("Output history is off.");
  await expect(page.locator("[data-output]")).toHaveCount(0);
  await page.locator("#nav-settings").click();
  await page.locator("#outputHistoryLimit").fill("5");
  await page.locator("#save-settings").click();
  await page.locator("#nav-recent").click();
  await page.locator("#open-outputs").click();
  await expect(page.locator("[data-output]")).toHaveCount(0);
});

test("CSV verification advances through populated cells and skips blank ones", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "checks.csv",
    "recipient,optional,reference\nAlex,,AB-104",
  );
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await expect(page.locator("#field-0")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.locator("#manual-value").fill("Alex");
  await page.locator("#apply-value").click();
  await expect(page.locator("#field-0")).toHaveClass(/verified/);
  await expect(page.locator("#field-2")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.locator("#manual-value")).toBeFocused();
  await page.locator("#manual-value").fill("AB-104");
  await page.locator("#apply-value").click();
  await expect(page.locator("#field-2")).toHaveClass(/verified/);
  await expect(page.locator("#field-1")).not.toHaveClass(/verified/);
});

test("source Scanner gives its title room and puts its preview beside the fields when widened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 690 });
  await page.goto("/");
  await expect(page.locator(".appbar nav button")).toHaveText(["Settings"]);
  await pickDocument(
    page,
    "address.veraflow",
    (await fixture("address.veraflow")).toString(),
  );
  const title = page.getByRole("heading", { name: "Address", exact: true });
  await expect(title).toBeVisible();
  const heading = await title.boundingBox();
  expect(heading?.width).toBeGreaterThan(240);
  await expect(page.locator("#task-tools")).not.toHaveAttribute("open");
  const work = page.locator(".scanner-work");
  const preview = page.locator(".scanner-preview");
  expect((await preview.boundingBox())!.y).toBeGreaterThan(
    (await work.boundingBox())!.y,
  );

  await page.setViewportSize({ width: 900, height: 690 });
  await expect(preview).toHaveCSS("position", "sticky");
  expect((await preview.boundingBox())!.x).toBeGreaterThan(
    (await work.boundingBox())!.x,
  );
  await page.locator("#scanner-control").fill("Alex Example");
  await page.locator("#use-scanner-control").click();
  await expect(preview).toContainText("Alex Example");
});

test("preview stays in the viewport as a long Fill form scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/");
  const fields = Array.from(
    { length: 22 },
    (_, index) => `Field ${index + 1} {{field-${index + 1}}}`,
  ).join("\n");
  await pickDocument(
    page,
    "long-form.vf",
    `--- veraflow 2\n{"workflow":"form"}\n---\n${fields}`,
  );
  const preview = page.locator("#form-output");
  await expect(preview).toHaveCSS("position", "sticky");
  await page.evaluate(() => window.scrollTo(0, 700));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const panel = await preview.boundingBox();
  expect(panel?.y).toBeGreaterThanOrEqual(0);
  expect(panel?.y).toBeLessThan(180);
  await page
    .getByLabel("field-15", { exact: true })
    .fill("Updated while scrolling");
  await expect(preview).toContainText("Updated while scrolling");
});

test("opens a nested template from a selected folder and keeps the folder after closing", async ({
  page,
}) => {
  const folder = await mkdtemp(join(tmpdir(), "vf-templates-"));
  try {
    await mkdir(join(folder, "nested"));
    const greeting = '--- veraflow 2\n{"workflow":"form"}\n---\nHello {{name}}';
    await Promise.all([
      writeFile(join(folder, "Greeting.vf"), greeting),
      writeFile(join(folder, "nested", "Greeting.veraflow"), greeting),
      writeFile(join(folder, "records.csv"), "name\nAlex Example"),
    ]);
    await page.goto("/");
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open folder…" }).click();
    await (await picker).setFiles(folder);
    const search = page.getByRole("searchbox", { name: "Find a template" });
    const nested = page.getByRole("button", {
      name: "nested/Greeting.veraflow",
      exact: true,
    });
    await expect(
      page.getByRole("button", { name: "Greeting.vf", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "records.csv", exact: true }),
    ).toHaveCount(0);
    await search.fill("nested");
    await expect(
      page.getByRole("button", { name: "Greeting.vf", exact: true }),
    ).toBeHidden();
    await nested.click();
    await expect(page.getByLabel("name", { exact: true })).toBeEditable();
    await page.locator("#cancel-session").click();
    await page.locator('button[value="discard"]').click();
    await expect(nested).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("prepared form output enters history and the close dialog resumes filled responses", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await pickDocument(
    page,
    "inline-greeting.veraflow",
    (await fixture("inline-greeting.veraflow")).toString(),
  );
  const fields = page.locator(".template-form [data-form-row]");
  await expect(fields.first()).toContainText("formal");
  await page.getByLabel("Name", { exact: true }).fill("Alex");
  await page.locator("#finish").click();
  await page.locator("#paste-options summary").click();
  await page.locator("#group-sections").check();
  await expect(page.locator(".output")).toHaveJSProperty(
    "textContent",
    "desk@example.com\n\nHello Alex, your order is ready.",
  );
  await page.locator("#cancel-session").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Return to Form" })
    .click();
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Alex");
  await name.focus();
  await name.evaluate((input: HTMLInputElement) =>
    input.setSelectionRange(2, 2),
  );
  await name.press("ControlOrMeta+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Alex");
  await expect(name).toBeFocused();
  await name.evaluate((input: HTMLInputElement) =>
    input.setSelectionRange(0, 2),
  );
  await name.press("ControlOrMeta+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Al");
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await page.locator("#open-outputs").click();
  await page.locator("#output-0").click();
  await expect(page.locator(".history-output")).toContainText(
    "Hello Alex, your order is ready.",
  );
});

test("source Scanner uses choices directly rather than the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const source = (await fixture("inline-greeting.veraflow"))
    .toString()
    .replace('"workflow": "form"', '"workflow": "scanner"')
    .replace(', "default": false', "");
  await pickDocument(page, "inline-greeting.veraflow", source);
  await expect(page.locator("#scanner-control legend")).toHaveText("formal");
  await expect(page.locator("#manual-entry")).toHaveCount(0);
  const yes = page.getByRole("radio", { name: "Yes" });
  await yes.check();
  await yes.press("Enter");
  await expect(
    page.getByRole("button", { name: "Compare value" }),
  ).toBeVisible();
  await yes.check();
  await yes.press("Enter");
  await page.locator("#finish").click();
  await expect(page.locator(".output")).toHaveText(
    '"Joe Sample" <joe.sample@example.com>',
  );
  await page.locator("#section-edit").click();
  const field = page.getByRole("button", { name: /formal.*true/ });
  await expect(field).toBeFocused();
  await page.getByRole("button", { name: "Copy field", exact: true }).click();
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  await expect.poll(clipboard).toBe("true");

  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  await page.locator("#pause-task").focus();
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(clipboard).toBe("true");
});

test("switching named outputs retains values and JSON saves the shared record", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "shared-record.veraflow",
    (await fixture("shared-record.veraflow")).toString() +
      '\n{{#output incomplete "Incomplete"}}\n{{Unfilled}}\n{{/output}}',
  );
  await page.getByLabel("Reference", { exact: true }).fill("VF-104");
  await page.getByLabel("Contact", { exact: true }).fill("Alex");
  await page
    .getByLabel("InternalNote", { exact: true })
    .fill("Private example");
  await expect(page.locator("#form-output")).toContainText("Hello Alex");
  await page.locator("#source-output").selectOption("row");
  await expect(page.locator("#form-output pre")).toHaveJSProperty(
    "textContent",
    "VF-104\tAlex\tPending",
  );
  await expect(page.getByLabel("Contact", { exact: true })).toHaveValue("Alex");
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save record as JSON…" }).click();
  const record = await result;
  expect(record.suggestedFilename()).toMatch(/^Service-visit-VF-104-.*\.json$/);
  expect(
    JSON.parse(await readFile((await record.path())!, "utf8")),
  ).toMatchObject({
    Reference: "VF-104",
    Contact: "Alex",
    InternalNote: "Private example",
  });
  await page.locator("#finish").click();
  await expect(page.locator(".output")).toHaveJSProperty(
    "textContent",
    "VF-104\tAlex\tPending",
  );
  await page.locator("#source-output").selectOption("incomplete");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("#source-output")).toHaveValue("row");
  await expect(page.locator(".output")).toHaveJSProperty(
    "textContent",
    "VF-104\tAlex\tPending",
  );
  await page.locator("#source-output").selectOption("note");
  await expect(page.locator(".output")).toContainText("Hello Alex");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("linked CSV opens at output and walks row-output pairs in both directions", async ({
  page,
}) => {
  const folder = await mkdtemp(join(tmpdir(), "veraflow-linked-csv-"));
  try {
    const source = (await fixture("linked-records.veraflow")).toString();
    await writeFile(join(folder, "linked-records.veraflow"), source);
    await writeFile(
      join(folder, "linked-records.csv"),
      await fixture("linked-records.csv"),
    );
    await page.goto("/");
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#open-folder").click();
    await (await chooser).setFiles(folder);
    await page
      .getByRole("button", { name: "linked-records.veraflow", exact: true })
      .click();

    const row = page.getByLabel("CSV row", { exact: true });
    const output = page.getByLabel("Output", { exact: true });
    const result = page.locator(".output");
    await expect(row.locator("option:checked")).toHaveText(
      "1 · VF-104 · Alex · North",
    );
    await expect(result).toHaveText(
      "Hello Alex, your visit VF-104 is at North.",
    );
    await expect(page.locator("#section-edit")).toHaveCount(0);

    const next = page.getByRole("button", { name: "Next row", exact: true });
    await next.click();
    await expect(row).toHaveValue("1");
    await expect(result).toContainText("Hello Drew");
    await next.click();
    await expect(row).toHaveValue("0");
    await expect(output).toHaveValue("row");
    await expect(result).toHaveJSProperty("textContent", "VF-104\tAlex\tNorth");
    await page
      .getByRole("button", { name: "Previous row", exact: true })
      .click();
    await expect(row).toHaveValue("1");
    await expect(output).toHaveValue("note");
    await page
      .getByRole("button", { name: "Next output", exact: true })
      .click();
    await expect(row).toHaveValue("1");
    await expect(result).toHaveJSProperty("textContent", "VF-105\tDrew\tSouth");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
