import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = (name: string) =>
  readFile(new URL(`../../examples/source/${name}`, import.meta.url));

async function openSource(page: Page) {
  await page.locator("#nav-templates").click();
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
    '--- veraflow 2\n{"workflow":"form"}\n---\nHello {{name}}',
  );
  await page.getByLabel("name", { exact: true }).fill("Alex Example");
  await page.locator("#switch-scanner").click();
  await expect(page.locator(".capture-field")).toContainText("Alex Example");
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
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Alex");
  await page.locator("#cancel-session").click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save prefilled template" }).click();
  const snapshot = await download;
  expect(snapshot.suggestedFilename()).toBe("prefilled-template.veraflow");
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
  await expect(page.locator("#nav-templates")).toBeVisible();
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
  await expect(page.locator("#nav-templates")).toBeVisible();
});

test("explicit navigation works in step and sequence mode and failure retains the pending section", async ({
  page,
}) => {
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
