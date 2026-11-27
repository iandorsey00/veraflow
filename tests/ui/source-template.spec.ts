import { openLegacyLibrary } from "./fixtures";
import { test, expect, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = (name: string) =>
  readFile(new URL(`../../examples/source/${name}`, import.meta.url));

async function openFormTools(page: Page) {
  const tools = page.locator("#source-form-tools");
  if (!(await tools.evaluate((element: HTMLDetailsElement) => element.open)))
    await tools.locator("summary").click();
}

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
    page
      .getByRole("group", { name: "Dead on arrival?" })
      .getByRole("radio", { name: "Yes" }),
  ).toBeChecked();
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
  await page.locator(".form-optional > summary").click();
  await page.getByLabel("Attention", { exact: true }).fill("Receiving");
  await expect(page.locator("#form-output")).toBeHidden();
  await expect(page.locator(".template-form .task-progress")).toBeVisible();
});

async function pickDocument(page: Page, name: string, text: string) {
  // Suppress the system dialog and feed the attached input independently of the event.
  const interceptChooser = () => {};
  page.on("filechooser", interceptChooser);
  try {
    await page.locator("#open-document").click();
    await page.locator("#open-document-file").setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });
  } finally {
    page.off("filechooser", interceptChooser);
  }
}

test("opens a source form with instructions and switches outputs without losing values", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#nav-workspace")).toHaveCount(0);
  await pickDocument(
    page,
    "Greeting.veraflow",
    `--- veraflow 2
{"workflow":"form","instructions":"Check the booking.\\nUse <reference> exactly.","fields":{"name":{"type":"text","instructions":"Use <b>the full name</b>.\\nKeep {{punctuation}} as written."}}}
---
{{#output greeting "Greeting"}}
Hello {{name}}
{{/output}}
{{#output farewell "Farewell"}}
Bye {{name}}
{{/output}}`,
  );
  const instructions = page.getByRole("complementary", {
    name: "Form instructions",
  });
  await expect(instructions).toHaveJSProperty(
    "textContent",
    "Check the booking.\nUse <reference> exactly.",
  );
  await expect(page.locator("#form-output")).not.toContainText(
    "Check the booking.",
  );
  const name = page.getByRole("textbox", { name: "name", exact: true });
  await expect(name).toHaveAccessibleDescription(
    /Use <b>the full name<\/b>\. Keep \{\{punctuation\}\} as written\./,
  );
  await expect(name.locator("+ .field-instructions")).toHaveJSProperty(
    "textContent",
    "Use <b>the full name</b>.\nKeep {{punctuation}} as written.",
  );
  await name.fill("Alex Example");
  await expect(page.locator("#form-output")).not.toContainText("the full name");
  const output = page.getByLabel("Output", { exact: true });
  await page
    .getByRole("button", { name: "Next output", exact: true })
    .press("Enter");
  await expect(output).toHaveValue("farewell");
  await expect(instructions).toBeVisible();
  await expect(page.locator("#form-output")).toContainText("Bye Alex Example");
  await page
    .getByRole("button", { name: "Previous output", exact: true })
    .click();
  await expect(output).toHaveValue("greeting");
  await expect(page.getByLabel("name", { exact: true })).toHaveValue(
    "Alex Example",
  );
});

test("queues desktop open events and opens both plain and legacy workflow files as forms", async ({
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Erase session" })
    .click();
  await expect(page.getByLabel("booking", { exact: true })).toBeVisible();
});

test("opens a CSV row in a custom form or fills a form from a file", async ({
  page,
}) => {
  await page.goto("/");
  const csv = "name,booking\nAlex Example,001\nDrew Example,002";
  await pickDocument(page, "Bookings.csv", csv);
  await page.locator("#dialog-row").selectOption("1");
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue(
    "Drew Example",
  );
  await expect(page.getByLabel("booking", { exact: true })).toHaveValue("002");
  await page.locator("#session-home").click();
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
  await expect(page.getByLabel("name", { exact: true })).toHaveValue(
    "Alex Example",
  );
  await page.locator("#resume-slot-freeScanner").click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue(
    "Drew Example",
  );
});

test("form fields use source labels and text layout", async ({ page }) => {
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
  await expect(address).not.toHaveAttribute("aria-invalid");
  await expect(page.locator("#form-output pre")).toHaveJSProperty(
    "textContent",
    "A-104\n100 Example Way\nExample City",
  );
  await ticket.focus();
  await expect(address).toHaveValue("100 Example Way\nExample City");
});

test("saves incomplete responses as a file and reopens an editable copy", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(page, "Greeting.vf", "Hello {{name}} from {{place}}.");
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
  await dialog.getByRole("button", { name: "Save prefilled form" }).click();
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
  await page.getByRole("button", { name: "Save prefilled form" }).click();
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

test("recent sessions restore filled values and choices", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Recently opened forms" }),
  ).toBeVisible();
  await expect(page.locator("footer")).toContainText(/VeraFlow \d+\.\d+\.\d+/);
  await expect(
    page.locator(".recent-documents .toolbar #nav-scanner"),
  ).toHaveText("Create form");
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
  await expect(page.getByLabel("Full name", { exact: true })).toBeHidden();
  await expect(page.getByRole("radio", { name: "Standard" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Express" })).toBeChecked();
  await page.keyboard.press("Alt+Shift+n");
  await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
  await page.getByLabel("Full name", { exact: true }).fill("Alex Example");
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Save to recent forms" }).click();
  await page
    .getByRole("button", { name: /Booking intake.*conditional-booking/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Booking intake" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Alex Example",
  );
  await expect(page.getByRole("radio", { name: "Express" })).toBeChecked();
  await page.getByLabel("Full name", { exact: true }).fill("Edited draft");
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await page.locator("[data-recent]").click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Alex Example",
  );
  await page.getByLabel("Full name", { exact: true }).fill("Alex Updated");
  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Save to recent forms" }).click();
  await expect(page.locator("[data-recent]")).toHaveCount(1);
  await page.locator("[data-recent]").click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Alex Updated",
  );
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
  await expect(page.getByLabel("notes", { exact: true })).toHaveValue(
    "Unique search phrase",
  );
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

test("form attention follows field-level verification rules and active output", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "intake.vf",
    `--- veraflow 2
{"verify-by-default":true,"fields":{
  "Reference":{"type":"text"},
  "Contact":{"type":"text","verify":false},
  "Notes":{"type":"text","optional":true}
}}
---
{{#output main "Summary"}}
{{Reference}} / {{Contact}}
{{when Notes is not blank: ' ({{Notes}})'}}
{{/output}}
{{#output alternate "Contact only"}}
{{Contact}}
{{/output}}`,
  );
  const summary = page.getByRole("region", { name: "Needs attention" });
  const reference = page.getByLabel("Reference", { exact: true });
  const contact = page.getByLabel("Contact", { exact: true });
  await expect(page.getByLabel("Notes", { exact: true })).toBeHidden();
  await summary
    .getByRole("button", { name: "Reference · Missing value" })
    .click();
  await expect(reference).toBeFocused();
  await reference.fill("VF-104");
  await page.keyboard.press("Alt+Shift+n");
  await expect(contact).toBeFocused();
  await contact.fill("Alex");

  await expect(
    summary.getByRole("button", { name: "Reference · Needs verification" }),
  ).toBeVisible();
  await expect(summary).not.toContainText("Contact");
  await page.getByLabel("Output", { exact: true }).selectOption("alternate");
  await expect(summary).toBeHidden();
  await page.getByLabel("Output", { exact: true }).selectOption("main");
  await verifyFormValue(page, "Reference", "VF-104");
  await expect(summary).toBeHidden();
  await reference.fill("VF-105");
  await expect(summary).toContainText("Reference · Needs verification");
  await verifyFormValue(page, "Reference", "VF-105");
  await page.getByRole("button", { name: "Prepare output sections" }).click();
  await expect(page.locator(".output")).toHaveText("VF-105 / Alex");
});

test("CSV values in a custom form can be verified individually", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "checks.csv",
    "recipient,optional,reference\nAlex,,AB-104",
  );
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await expect(page.getByLabel("recipient", { exact: true })).toHaveValue(
    "Alex",
  );
  await expect(page.getByLabel("reference", { exact: true })).toHaveValue(
    "AB-104",
  );
  await expect(
    page.getByRole("button", { name: "Verify field · optional" }),
  ).toBeDisabled();
  await verifyFormValue(page, "recipient", "Alex");
  await expect(
    page.getByRole("button", { name: "Verify again · recipient" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Verify field · reference" }),
  ).toBeEnabled();
});

async function verifyFormValue(
  page: Page,
  field: string,
  value: string,
  again = false,
) {
  await page
    .getByRole("button", {
      name: `${again ? "Verify again" : "Verify field"} · ${field}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#dialog-original").fill(value);
  await dialog.getByRole("button", { name: "Compare value" }).click();
}

test("form gives its title room and puts its preview beside the fields when widened", async ({
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
  const work = page.locator(".template-form-grid > div").first();
  const preview = page.locator("#form-output");
  expect((await preview.boundingBox())!.y).toBeGreaterThan(
    (await work.boundingBox())!.y,
  );

  await page.setViewportSize({ width: 900, height: 690 });
  await expect(preview).toHaveCSS("position", "sticky");
  expect((await preview.boundingBox())!.x).toBeGreaterThan(
    (await work.boundingBox())!.x,
  );
  await page.getByLabel("Recipient", { exact: true }).fill("Alex Example");
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
    const search = page.getByRole("searchbox", { name: "Find a form" });
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
  await page.locator(".form-optional > summary").click();
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

test("legacy Scanner files open as forms and can verify a choice by its ID", async ({
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
  await page.getByRole("radio", { name: "Yes" }).check();
  const copy = page.getByRole("button", {
    name: "Copy field · formal",
    exact: true,
  });
  await expect(copy).toBeDisabled();
  await page
    .getByRole("button", { name: "Verify field · formal", exact: true })
    .click();
  await page.locator("#dialog-original").selectOption("true");
  await page.getByRole("button", { name: "Compare value" }).click();
  await page.locator("#finish").click();
  await expect(page.locator(".output")).toHaveText(
    '"Joe Sample" <joe.sample@example.com>',
  );
  await page.locator("#section-edit").click();
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("true");
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
  await page.locator(".form-optional > summary").click();
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
  await openFormTools(page);
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

test("form normalizes a comparison and reopens a verified prefilled response", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "Address.veraflow",
    `--- veraflow 2
{"workflow":"scanner","fields":{
  "Address":{"type":"textarea","allowBlankLines":false}
},"responses":{"Address":"12 Sample Way\\nPortland"}}
---
{{Address}}`,
  );
  await verifyFormValue(page, "Address", "12 Sample Way\n\nPortland");
  const field = page.locator("#form-state-0");
  await expect(field).toHaveText("Verified");
  await page.locator("#cancel-session").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save prefilled form" }).click();
  const snapshot = await download;
  const content = await readFile((await snapshot.path())!, "utf8");
  expect(content).toContain('"verification"');
  await pickDocument(page, snapshot.suggestedFilename(), content);
  await expect(field).toHaveText("Verified");
  await verifyFormValue(page, "Address", "12 Sample Way\nSeattle", true);
  await expect(field).toHaveText("Mismatch");
  await expect(page.getByLabel("Address", { exact: true })).toHaveValue(
    "12 Sample Way\nPortland",
  );
});

test("switches Form, CSV, and Append without replacing a draft and reviews duplicate CSV appends", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        String.raw`
        let csv = "Carrier,ID\nExample Ground,VF-105\n";
        platform.pickAppendCSV = async () => ({ token: 42, name: "shipments.csv", content: csv });
        platform.appendCSVRow = async (_token, suffix) => {
          if (window.vfRejectAppend) throw Error("appendChanged");
          csv += suffix;
          window.vfCSV = csv;
        };
      `,
    });
  });
  await page.goto("/");
  await pickDocument(
    page,
    "Shipment.vf",
    `--- veraflow 2
{"workflow":"form","append":{"duplicateKey":"ID","carryForward":["Carrier"]},
"outputs":{"main":{"row":{"ID":"{{Reference}}","Carrier":"{{Carrier}}"}}}}
---
{{Reference}} / {{Carrier}}`,
  );
  const ref = page.getByLabel("Reference", { exact: true });
  const carrier = page.getByLabel("Carrier", { exact: true });
  await ref.fill("draft");
  await carrier.fill("Ground");

  const picker = page.waitForEvent("filechooser");
  await openFormTools(page);
  await page.locator("#switch-csv").click();
  await (
    await picker
  ).setFiles({
    name: "other.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Reference,Carrier\nVF-104,Air\nVF-105,Ground\n"),
  });
  await page.getByLabel("CSV row", { exact: true }).selectOption("1");
  await expect(page.locator(".output")).toContainText("VF-105 / Ground");
  await page.locator("#switch-form").click();
  await expect(ref).toHaveValue("draft");
  await openFormTools(page);
  await page.locator("#switch-csv").click();
  await expect(page.getByLabel("CSV row", { exact: true })).toHaveValue("1");
  await page.locator("#use-csv-row").click();
  const confirm = page.getByRole("dialog", {
    name: "Replace the current draft with this CSV row?",
  });
  await confirm.getByRole("button", { name: "Use this row in Form" }).click();
  await expect(ref).toHaveValue("VF-105");

  await openFormTools(page);
  await page.locator("#switch-append").click();
  await page.locator("#append-choose").click();
  await expect(page.locator(".append-destination")).toHaveText("shipments.csv");
  await expect(page.locator(".append-panel summary")).toContainText(
    "Matching key in data row 1",
  );
  await page.evaluate(() => Object.assign(window, { vfRejectAppend: true }));
  await page.locator("#append-write-next").click();
  const duplicate = page.getByRole("dialog", {
    name: "This key already exists. Append another row?",
  });
  await duplicate
    .getByRole("button", { name: "Append row", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText("The CSV changed");
  await expect(page.locator(".append-cells").last()).toContainText("VF-105");
  await page.evaluate(() => Object.assign(window, { vfRejectAppend: false }));
  await page.locator("#append-choose").click();
  await page.locator("#append-write-next").click();
  await duplicate
    .getByRole("button", { name: "Append row", exact: true })
    .click();
  await expect(ref).toHaveValue("");
  await expect(carrier).toHaveValue("Ground");
  await expect(page.locator("#notice")).toContainText("Added data row 2");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { vfCSV: string }).vfCSV),
    )
    .toBe("Carrier,ID\nExample Ground,VF-105\nGround,VF-105\n");
});

test.describe("snippet collections", () => {
  test.use({ timezoneId: "Asia/Kolkata" });
  test("copies timestamp and selected text only on the corresponding button click", async ({
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
          String.raw`
          window.snippetReads = 0;
          platform.mouseTransfer = async (restore) => {
            if (!restore) throw Error("Expected guarded capture");
            window.snippetReads++;
            return "Alex {{name}}";
          };
        `,
      });
    });
    await page.clock.setFixedTime(new Date("2026-11-21T09:15:25Z"));
    await page.goto("/");
    await pickDocument(
      page,
      "quick-snippets.veraflow",
      (await fixture("quick-snippets.veraflow")).toString(),
    );
    await expect(
      page.getByRole("heading", { name: "Quick snippets" }),
    ).toBeVisible();
    await expect(page.locator(".template-form")).toHaveCount(0);

    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await page.getByRole("button", { name: "Copy timestamp" }).click();
    await expect.poll(clipboard).toBe("2026-11-21 14:45:25 +0530");
    expect(
      await page.evaluate(
        () => (window as unknown as { snippetReads: number }).snippetReads,
      ),
    ).toBe(0);

    await page.getByRole("button", { name: "Copy greeting" }).click();
    await expect.poll(clipboard).toBe("Hi Alex {{name}}");
    expect(
      await page.evaluate(
        () => (window as unknown as { snippetReads: number }).snippetReads,
      ),
    ).toBe(1);
    await page.getByRole("button", { name: "Close session" }).click();
    await expect(
      page.getByRole("heading", { name: "Recently opened forms" }),
    ).toBeVisible();
    await expect(page.locator("[data-recent]")).toHaveCount(0);
  });
});

test("keeps a source form, a custom form, and a snippet collection open independently", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "greeting.veraflow",
    '--- veraflow 2\n{"title":"Greeting form","workflow":"form"}\n---\nHello {{Name}}',
  );
  await page.getByLabel("Name", { exact: true }).fill("Alex");
  await page.locator("#session-home").click();
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page.locator("#dialog-fields").fill("Reference\nNotes");
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  await page.getByLabel("Reference", { exact: true }).fill("VF-104");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("unfinished custom form entry");

  await page.locator("#session-home").click();
  await pickDocument(
    page,
    "quick-snippets.veraflow",
    (await fixture("quick-snippets.veraflow")).toString(),
  );
  await expect(
    page.getByRole("button", { name: "Copy timestamp" }),
  ).toBeVisible();
  await page.locator("#resume-slot-template").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex");
  await page.locator("#resume-slot-freeScanner").click();
  await expect(page.getByLabel("Reference", { exact: true })).toHaveValue(
    "VF-104",
  );
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "unfinished custom form entry",
  );
  await page.locator("#resume-slot-snippet").click();
  await page.locator("#snippet-close").click();
  await page.locator("#resume-slot-template").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex");
});

test("snippet selection fallback asks before reading clipboard and offers manual input and output", async ({
  page,
}) => {
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        String.raw`
      window.snippetReads = 0;
      platform.mouseTransfer = async () => { throw Error("captureFailed"); };
      platform.readClipboard = async () => { window.snippetReads++; throw Error("clipboardBusy"); };
      platform.copy = async () => { throw Error("clipboardBusy"); };
    `,
    });
  });
  await page.goto("/");
  await pickDocument(
    page,
    "fallback.veraflow",
    '--- veraflow 2\n{"title":"Fallback"}\n---\n{{#action greet "Copy greeting"}}\nHi {{@selection-or-clipboard}}\n{{/action}}',
  );
  await page.getByRole("button", { name: "Copy greeting" }).click();
  const picker = page.getByRole("dialog", {
    name: "Could not capture selected text",
  });
  await expect(picker).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { snippetReads: number }).snippetReads,
    ),
  ).toBe(0);
  await picker.getByRole("button", { name: "Use clipboard" }).click();
  await page.getByLabel("Paste or type the text to use").fill("Alex");
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  const output = page.getByRole("dialog", { name: "Copy the result manually" });
  await expect(output.getByLabel("Generated text")).toHaveValue("Hi Alex");
});

test("steps share verified values, keep copy separate from advance, and flag stale transfers", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await pickDocument(
    page,
    "shipment-steps.veraflow",
    (await fixture("shipment-steps.veraflow")).toString(),
  );

  const step = page.locator("#form-step-heading");
  const prepare = page.getByRole("button", { name: "Prepare output sections" });
  const copy = page.getByRole("button", { name: "Copy current section" });
  const next = page.getByRole("button", { name: "Next step", exact: true });
  const previous = page.getByRole("button", {
    name: "Previous step",
    exact: true,
  });
  const field = (name: string) => page.getByLabel(name, { exact: true });
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  await expect(step).toHaveText("Prepare shipment");
  await expect(field("Tracking")).toHaveCount(0);
  await expect(next).toHaveCount(0);
  await field("Reference").fill("VF-104");
  await field("Recipient").fill("Alex");
  await expect(page.locator("#form-output .output-instructions")).toHaveText(
    "Paste the subject and message into the dispatch email.",
  );
  await prepare.click();
  await expect(field("Reference")).toBeFocused();
  await verifyFormValue(page, "Reference", "VF-104");
  await prepare.click();
  await expect(page.locator(".output-instructions")).toBeVisible();
  await copy.click();
  await expect.poll(clipboard).toBe("Shipment VF-104");
  await expect(step).toHaveText("Prepare shipment");

  await next.click();
  await expect(step).toHaveText("Record pickup");
  await expect(field("Tracking")).toBeFocused();
  await page.getByText("Fields from earlier steps", { exact: true }).click();
  await expect(page.locator(".step-reused")).toContainText("VF-104 Verified");
  await field("Tracking").fill("PK-12");
  await prepare.click();
  await copy.click();
  await expect
    .poll(clipboard)
    .toBe("Shipment VF-104 picked up. Tracking: PK-12.");
  await next.click();
  await expect(step).toHaveText("Confirm delivery");
  await field("Delivered").fill("2026-11-23");

  await previous.click();
  await previous.click();
  await field("Reference").fill("VF-105");
  await expect(page.locator(".step-warnings")).toContainText(
    "Prepare shipment · Inputs changed after transfer",
  );
  await expect(page.locator(".step-warnings")).toContainText(
    "Record pickup · Inputs changed after transfer",
  );
  await expect(page.locator(".step-warnings")).not.toContainText(
    "Confirm delivery",
  );

  await verifyFormValue(page, "Reference", "VF-105");
  await prepare.click();
  await expect(page.locator(".step-warnings")).toContainText(
    "Prepare shipment",
  );
  await copy.click();
  await expect.poll(clipboard).toBe("Shipment VF-105");
  await expect(page.locator(".step-warnings")).not.toContainText(
    "Prepare shipment",
  );
  await next.click();
  await expect(field("Tracking")).toHaveValue("PK-12");
  await prepare.click();
  await expect(page.locator(".output")).toHaveText(
    "Shipment VF-105 picked up. Tracking: PK-12.",
  );
  await next.click();
  await expect(field("Delivered")).toHaveValue("2026-11-23");

  await page
    .getByRole("button", { name: "Close session", exact: true })
    .click();
  await page.getByRole("button", { name: "Save to recent forms" }).click();
  await page
    .getByRole("button", { name: /Shipment follow-up.*shipment-steps/ })
    .click();
  await expect(step).toHaveText("Confirm delivery");
  await expect(field("Delivered")).toHaveValue("2026-11-23");
  await prepare.click();
  await expect(page.locator(".output")).toHaveText(
    "Shipment VF-105 (PK-12) delivered on 2026-11-23.",
  );
});

test("collect-only step resumes and multiple outputs prepare from one reviewed record", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await pickDocument(
    page,
    "housing-application.vf",
    (await fixture("housing-application.vf")).toString(),
  );
  const heading = page.locator("#form-step-heading");
  const legalName = "Legal name / 法定姓名";
  await page.getByLabel(legalName, { exact: true }).fill("Alex Example");
  await openFormTools(page);
  await page.getByRole("button", { name: "Import JSON / JSON5…" }).click();
  const pick = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose JSON file…" }).click();
  await (
    await pick
  ).setFiles({
    name: "housing-response.json",
    mimeType: "application/json",
    buffer: await fixture("housing-response.json"),
  });
  const dialog = page.getByRole("dialog", { name: "Review record changes" });
  await expect(dialog).toContainText("Alex Example");
  await expect(dialog).toContainText("Drew Example");
  await dialog.getByRole("button", { name: "Apply all changes" }).click();
  await verifyFormValue(page, legalName, "Drew Example");

  await page.locator("#cancel-session").click();
  await page.getByRole("button", { name: "Save to recent forms" }).click();
  await page.locator("[data-recent]").click();
  await expect(heading).toContainText("Collect applicant details");
  await expect(page.locator("#source-output")).toHaveCount(0);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(heading).toContainText("Review application");
  await page.locator(".form-optional summary").click();
  await page
    .getByLabel("English wording / 英文表述", { exact: true })
    .fill("The current home is too far from work.");
  await page.evaluate(() => navigator.clipboard.writeText("unchanged"));
  await page.getByRole("button", { name: "Prepare all step outputs" }).click();
  await expect(page.locator(".output")).toContainText("Employment: Employed");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("unchanged");
  await page.getByLabel("Output", { exact: true }).selectOption("review");
  await expect(page.locator(".output")).toContainText(
    "搬家原因：现在的住处离公司太远。",
  );
});

test("a custom form can seed a source form with named outputs", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-scanner").click();
  await page.locator("#start-scanner").click();
  await page.locator("#dialog-fields").fill("Contact\nReference");
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  await page.getByLabel("Contact", { exact: true }).fill("Alex Example");
  await page.getByLabel("Reference", { exact: true }).fill("VF-104");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Use with form file…" }).click();
  await (
    await chooser
  ).setFiles({
    name: "shared-record.veraflow",
    mimeType: "text/plain",
    buffer: await fixture("shared-record.veraflow"),
  });
  await expect(page.getByLabel("Contact", { exact: true })).toHaveValue(
    "Alex Example",
  );
  await page.getByLabel("Output", { exact: true }).selectOption("row");
  await expect(page.locator("#form-output pre")).toContainText("VF-104");
  await page.locator("#resume-slot-freeScanner").click();
  await expect(page.getByLabel("Contact", { exact: true })).toHaveValue(
    "Alex Example",
  );
});

test("bulk source file review resolves ambiguity and invalidates changed verification", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "service-intake.vf",
    (await fixture("service-intake.vf")).toString(),
  );
  await page.getByLabel("Serial number", { exact: true }).fill("ABC123456");
  await verifyFormValue(page, "Serial number", "ABC123456");

  await page.getByRole("button", { name: "Extract from source…" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open text file…" }).click();
  await (
    await chooser
  ).setFiles({
    name: "service-intake-source.txt",
    mimeType: "text/plain",
    buffer: await fixture("service-intake-source.txt"),
  });
  await expect(page.locator("#extract-text")).toHaveValue(/型号|序列号/);
  await page.getByRole("button", { name: "Find candidates" }).click();

  const review = page.getByRole("dialog", { name: "Review candidates" });
  await expect(
    review.getByRole("heading", { name: /Review these decisions/ }),
  ).toBeVisible();
  await expect(
    review.getByRole("heading", { name: /New values/ }),
  ).toBeVisible();
  await expect(review.locator(".candidate-group").first()).toContainText(
    "Serial number",
  );
  const serial = review.getByRole("group", {
    name: "Serial number",
    exact: true,
  });
  await expect(serial).toContainText("Ambiguous source");
  await expect(serial).toContainText("序列号：ABC123458");
  const choices = serial.getByLabel("Source alternatives");
  const corrected = await choices
    .getByRole("option", { name: "ABC123458" })
    .getAttribute("value");
  await choices.selectOption(corrected!);
  await serial.getByRole("checkbox", { name: "Apply · Serial number" }).check();
  await review
    .getByRole("checkbox", { name: "Apply · Shipping city" })
    .uncheck();
  await review.getByRole("button", { name: "Apply selected values" }).click();

  await expect(page.getByLabel("Display model", { exact: true })).toHaveValue(
    "V6530",
  );
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "ABC123458",
  );
  await expect(page.getByLabel("Shipping city", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: /Serial number · Needs verification/ }),
  ).toBeVisible();
  await verifyFormValue(page, "Serial number", "ABC123458");
  await page.getByRole("button", { name: "Prepare output sections" }).click();
  await expect(page.locator(".output")).toContainText(
    "V6530 · 1 affected · serial ABC123458",
  );
});

test("external candidate files show inferred evidence and require explicit replacement", async ({
  page,
}) => {
  await page.goto("/");
  await pickDocument(
    page,
    "service-intake.vf",
    (await fixture("service-intake.vf")).toString(),
  );
  await page.getByLabel("Serial number", { exact: true }).fill("ABC123458");
  await page.getByRole("button", { name: "Extract from source…" }).click();
  await page
    .locator("#extract-text")
    .fill((await fixture("service-intake-email.txt")).toString());
  await page.getByText("External extraction files", { exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import candidates…" }).click();
  await (
    await chooser
  ).setFiles({
    name: "service-email-candidates.json",
    mimeType: "application/json",
    buffer: await fixture("service-email-candidates.json"),
  });
  const review = page.getByRole("dialog", { name: "Review candidates" });
  const quantity = review.getByRole("group", {
    name: "Affected units",
    exact: true,
  });
  await quantity.getByText("Source evidence", { exact: true }).click();
  await expect(quantity).toContainText("Inferred");
  await expect(quantity).toContainText("One stopped turning on yesterday.");
  const serial = review.getByRole("group", {
    name: "Serial number",
    exact: true,
  });
  await expect(serial.getByRole("checkbox")).not.toBeChecked();
  await review.getByRole("button", { name: "Apply selected values" }).click();
  await expect(page.getByLabel("Affected units", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "ABC123458",
  );
  await expect(
    page.getByLabel("Shipping address", { exact: true }),
  ).toHaveValue("");
});

test("a narrow form puts pending work ahead of fields and keeps tools closed until opened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 620 });
  await page.goto("/");
  await pickDocument(
    page,
    "service-intake.vf",
    (await fixture("service-intake.vf")).toString(),
  );
  const attention = page.getByRole("region", { name: "Needs attention" });
  const model = page.getByLabel("Display model", { exact: true });
  await expect(attention).toBeVisible();
  await expect(attention).toContainText("7 missing");
  await expect(
    page.getByRole("button", { name: "Extract from source…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import JSON / JSON5…" }),
  ).toBeHidden();
  expect((await attention.boundingBox())!.y).toBeLessThan(
    (await model.boundingBox())!.y,
  );
  await attention
    .getByRole("button", { name: "Next item needing attention" })
    .click();
  await expect(
    page.getByLabel("Affected units", { exact: true }),
  ).toBeFocused();
  await openFormTools(page);
  await expect(
    page.getByRole("button", { name: "Import JSON / JSON5…" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    340,
  );
});

test("JSON5 demo opens a filled form, prepares custom output, and exports plain JSON", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 620 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open JSON / JSON5…" }).click();
  const pick = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose JSON file…" }).click();
  await (
    await pick
  ).setFiles({
    name: "dispatch-record.json5",
    mimeType: "application/json5",
    buffer: await fixture("dispatch-record.json5"),
  });
  const review = page.getByRole("dialog", { name: "Review data" });
  await expect(review).toContainText("000184");
  await expect(review).toContainText("Unanswered");
  expect(
    await review.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(340);
  await review.getByText("Write your own output").click();
  const output = review.getByLabel("Output text");
  await output.fill("Dispatch {{ref}}.");
  await review.getByRole("button", { name: "Open filled form" }).click();
  await expect(review.getByRole("alert")).toHaveText(
    "Unknown field in this record. ref",
  );
  await output.fill(
    "Dispatch {{reference}} to {{destination}} for {{contact}}.",
  );
  await review.getByRole("button", { name: "Open filled form" }).click();
  await expect(page.getByLabel("reference", { exact: true })).toHaveValue(
    "000184",
  );
  await openFormTools(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save record as JSON…" }).click();
  const savedRecord = await readFile((await (await download).path())!, "utf8");
  const data = JSON.parse(savedRecord);
  expect(data).toMatchObject({
    reference: "000184",
    packages: "3",
    priority: "true",
    tracking: null,
  });
  await page.getByRole("button", { name: "Prepare output sections" }).click();
  await expect(page.locator(".output")).toHaveText(
    "Dispatch 000184 to North Depot for 林晓 / Alex Lin.",
  );
  await page
    .getByRole("button", { name: "Close session", exact: true })
    .click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await page.getByRole("button", { name: "Open JSON / JSON5…" }).click();
  await page.getByLabel("Or paste JSON or JSON5").fill(savedRecord);
  await page.getByRole("button", { name: "Review data" }).click();
  await review.getByRole("button", { name: "Open filled form" }).click();
  await page.getByRole("button", { name: "Prepare output sections" }).click();
  await expect(page.locator(".output")).toContainText("reference: 000184");
  await expect(page.locator(".output")).toContainText("priority: true");
});

test("pasted JSON5 can start from Home and fill an existing form after review", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open JSON / JSON5…" }).click();
  const input = page.getByLabel("Or paste JSON or JSON5");
  await input.fill("{Reference: []}");
  await page.getByRole("button", { name: "Review data" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Reference",
  );
  await expect(input).toBeFocused();
  await input.fill("{Reference: '000184', Contact: 'Alex', confirmed: false,}");
  await page.getByRole("button", { name: "Review data" }).click();
  const pick = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Use a form file…" }).click();
  await (
    await pick
  ).setFiles({
    name: "shared-record.veraflow",
    mimeType: "text/plain",
    buffer: await fixture("shared-record.veraflow"),
  });
  const review = page.getByRole("dialog", { name: "Review record changes" });
  await expect(review).toContainText("000184");
  await review.getByRole("button", { name: "Apply all changes" }).click();
  await expect(page.getByLabel("Reference", { exact: true })).toHaveValue(
    "000184",
  );
  await expect(page.getByLabel("Contact", { exact: true })).toHaveValue("Alex");
});

test("PDF export reviews the selected Markdown, configures tools, and reuses the chosen form", async ({
  page,
}) => {
  const form = {
    name: "résumé 样例.vf",
    format: "source",
    content: (await fixture("resume-pdf.vf")).toString(),
    recentToken: 1,
  };
  await page.route("**/src/platform.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
        const form = ${JSON.stringify(form)};
        let usedForm = false;
        let configured = false;
        let cancel;
        platform.pdfAvailable = true;
        platform.pickDocument = async () => form;
        platform.rememberRecordForm = async token => { usedForm = token === 1; };
        platform.recentRecordForms = async () => usedForm ? [form.name] : [];
        platform.openRecordForm = async () => form;
        platform.pdfTools = async () => ({
          configured,
          tools: { pandoc: '/opt/homebrew/bin/pandoc', xelatex: configured ? '/Library/TeX/texbin/xelatex' : null },
        });
        platform.pickPdfTool = async () => '/Library/TeX/texbin/xelatex';
        platform.configurePdf = async () => { configured = true; };
        platform.savePdf = async (text, filename, start) => {
          window.pdfRequest = { text, filename };
          start();
          return new Promise((_, reject) => { cancel = () => reject('pdfCancelled'); });
        };
        platform.cancelPdf = async () => cancel();
      `,
    });
  });
  const record = (await fixture("resume-pdf.json")).toString();
  async function chooseRecord(text: string) {
    await page.getByRole("button", { name: "Open JSON / JSON5…" }).click();
    await page.getByLabel("Or paste JSON or JSON5").fill(text);
    await page.getByRole("button", { name: "Review data" }).click();
  }
  await page.goto("/");
  await chooseRecord(record);
  await page.getByRole("button", { name: "Use a form file…" }).click();
  await page.getByRole("button", { name: "Apply all changes" }).click();
  await page.getByRole("button", { name: "Prepare output sections" }).click();
  const prepared = await page.locator(".output").textContent();
  await page.getByRole("button", { name: "Save as PDF…" }).click();
  const review = page.getByRole("dialog", { name: "Review Markdown for PDF" });
  await expect(review.locator("pre")).toContainText("mainfont: Helvetica");
  await expect(review.locator("pre")).not.toContainText("\\newpage");
  await expect(review.locator("pre")).toContainText(
    "<alex.lin@example.com> · +1 503 555 0148",
  );
  await expect(review.locator("pre")).toContainText("林晓");
  await review.getByRole("button", { name: "Choose PDF destination…" }).click();
  const setup = page.getByRole("dialog", { name: "PDF setup" });
  await expect(setup.getByText("/opt/homebrew/bin/pandoc")).toBeVisible();
  await expect(
    setup.getByRole("button", { name: "Use these tools" }),
  ).toBeDisabled();
  await setup.getByRole("button", { name: "Locate PDF Engine…" }).click();
  await setup.getByRole("button", { name: "Use these tools" }).click();
  const progress = page.getByRole("dialog", { name: "Save as PDF…" });
  await expect(progress.getByText("Creating PDF…")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            pdfRequest: { text: string; filename: string };
          }
        ).pdfRequest,
    ),
  ).toEqual({ text: prepared, filename: "Alex-Lin-林晓-résumé.pdf" });
  await progress.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("PDF creation cancelled.")).toBeVisible();
  await expect(page.locator(".output")).toHaveText(prepared!);
  await page.getByRole("button", { name: "Save as PDF…" }).click();
  const markdown = page.waitForEvent("download");
  await review.getByRole("button", { name: "Save Markdown…" }).click();
  expect(await readFile((await (await markdown).path())!, "utf8")).toBe(
    prepared,
  );
  await page
    .getByRole("button", { name: "Close session", exact: true })
    .click();
  await page.getByRole("button", { name: "Close without saving" }).click();

  await chooseRecord('{"headline":"Sample without required name"}');
  await page.getByRole("button", { name: "résumé 样例.vf" }).click();
  await page.getByRole("button", { name: "Apply all changes" }).click();
  const prepare = page.getByRole("button", { name: "Prepare output sections" });
  if (await prepare.isEnabled()) await prepare.click();
  await expect(page.getByRole("button", { name: "Save as PDF…" })).toHaveCount(
    0,
  );
});
