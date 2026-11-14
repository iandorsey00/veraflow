import { expect, test } from "@playwright/test";

test("Typing workflow previews fields and can restart completed responses when retention is enabled", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator("#nav-settings").click();
  await expect(page.locator("#focusedWorkflow")).not.toBeChecked();
  await page.locator("#clearAfterCompletion").uncheck();
  await page.locator("#save-settings").click();
  await page.locator("#nav-templates").click();
  await page.locator("#email-enabled").uncheck();
  await page
    .locator("#template-content")
    .fill(
      'Booking {{text reference:}} for {{select people: steve="Steve" | joe="Joe"}}. {{when people=joe: "Goodbye Joe"}}',
    );
  await expect(page.locator("#template-preview mark")).toHaveText(
    "{{text reference:}}",
  );
  await page.locator("#start-form").click();
  await page.getByLabel("reference", { exact: true }).fill("AB-104");
  await page.getByRole("radio", { name: "Joe", exact: true }).check();
  await expect(page.locator("#form-output pre")).toHaveText(
    "Booking AB-104 for Joe. Goodbye Joe",
  );
  await page.locator("#finish").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Booking AB-104 for Joe. Goodbye Joe");
  await page.locator("#close-session").click();
  await page.locator("#nav-session").click();
  await page.locator("#reuse-session").click();
  await expect(page.getByLabel("reference", { exact: true })).toHaveValue(
    "AB-104",
  );
  await expect(
    page.getByRole("radio", { name: "Joe", exact: true }),
  ).toBeChecked();
});

test("Typing repeat verification is independent of Scanner and shares the fields", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator("#nav-templates").click();
  await page.locator("#email-enabled").uncheck();
  await page
    .locator("#template-content")
    .fill("Booking {{reference}} ({{reference}})");
  await page.getByText("Template options", { exact: true }).click();
  await page.locator("#template-verify").uncheck();
  await page.locator("#typing-verify").check();
  await page.locator("#start-form").click();
  await page.getByLabel("reference", { exact: true }).fill("AB-104");
  await page.locator("#switch-scanner").click();
  await expect(page.locator(".field-value")).toHaveText("AB-104");
  await page.locator("#switch-form").click();
  await page.locator("#finish").click();
  await expect(page.locator("#typing-check")).toBeEmpty();
  await page.locator("#typing-check").fill("AB-105");
  await page.locator("#submit-typing-check").click();
  await expect(page.locator("#notice")).toContainText(
    "The second entry differs",
  );
  await page.locator("#typing-check").fill("AB-104");
  await page.locator("#submit-typing-check").click();
  await page.locator("#finish").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Booking AB-104 (AB-104)");
  await expect(page.locator("#reuse-session")).toHaveCount(0);
  await page.locator("#restart-session").click();
  await expect(page.getByLabel("reference", { exact: true })).toHaveValue("");
});

test("a selection can hide a field, preserve its entry, and change email headers", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav-templates").click();
  await page.locator("#email-subject").fill("Update");
  await page
    .locator("#email-to")
    .fill(
      '{{radio people: steve="steve@example.test" | joe="joe@example.test"}}',
    );
  await page
    .locator("#template-content")
    .fill(
      '{{when people=steve: "Hi Steve"}}{{when people=joe: "Hi Joe"}}\n{{textarea note: when people=joe}}',
    );
  await page.locator("#start-form").click();
  await expect(page.getByLabel("note", { exact: true })).toHaveCount(0);
  await page
    .getByRole("radio", { name: "joe@example.test", exact: true })
    .check();
  await page.getByLabel("note", { exact: true }).fill("Remember the booking");
  await page
    .getByRole("radio", { name: "steve@example.test", exact: true })
    .check();
  await expect(page.locator("#form-output")).not.toContainText(
    "Remember the booking",
  );
  await page
    .getByRole("radio", { name: "joe@example.test", exact: true })
    .check();
  await expect(page.getByLabel("note", { exact: true })).toHaveValue(
    "Remember the booking",
  );
  await page.locator("#finish").click();
  await page.locator("#email-next").click();
  await expect(page.locator(".output")).toHaveText("joe@example.test");
});
