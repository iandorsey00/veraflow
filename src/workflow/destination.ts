import { readFile } from "node:fs/promises";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import {
  employmentValues,
  fillEmployment,
} from "../../examples/source/collection/destination-adapter";
import type { Claim, Outcome } from "./engine";
import type { Workflow } from "./spec";

export interface DestinationAdapter {
  test(destination: Workflow["destination"]): Promise<void>;
  execute(
    claim: Claim,
    mayContinue: () => boolean,
    signal: AbortSignal,
  ): Promise<Outcome>;
  reveal(instanceId: string): Promise<void>;
  release(instanceId: string): Promise<void>;
  close(): Promise<void>;
}

const fixture = new URL(
  "../../examples/source/collection/destination.html",
  import.meta.url,
);
const destinationUrl = "https://employment.veraflow.invalid/intake";
const targets = new Set([
  "full_name",
  "employment_status",
  "employer",
  "job_title",
  "business",
  "incorporated",
  "registration",
  "seeking_role",
  "comments",
]);

export function validateDestination(destination: Workflow["destination"]) {
  if (
    destination.adapter !== "playwright-employment" ||
    destination.id !== "fictional-employment" ||
    destination.pages.length !== 1 ||
    destination.pages[0] !== "intake" ||
    !Object.hasOwn(destination.fields, "full_name") ||
    !Object.hasOwn(destination.fields, "employment_status") ||
    Object.keys(destination.fields).some((field) => !targets.has(field))
  )
    throw Error("unsupportedWorkflowDestination");
}

type BrowserOptions = {
  headless?: boolean;
  // Integration tests exercise unexpected layout changes without contacting a website.
  fixtureHtml?: string;
};

export class EmploymentDestination implements DestinationAdapter {
  private browser?: Browser;
  private reviews = new Map<string, { context: BrowserContext; page: Page }>();

  constructor(private options: BrowserOptions = {}) {}

  private async open() {
    const html = this.options.fixtureHtml ?? (await readFile(fixture, "utf8"));
    if (!this.browser?.isConnected())
      this.browser = await chromium.launch({
        headless: this.options.headless ?? false,
        timeout: 15000,
      });
    const context = await this.browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    try {
      // The demonstration origin exists only in this context. No real website
      // or form submission is reached, including subresources and redirects.
      await context.route("**/*", (route) => {
        const request = route.request();
        if (
          request.url() === destinationUrl &&
          request.method() === "GET" &&
          request.isNavigationRequest() &&
          request.frame().parentFrame() === null
        )
          return route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: html,
          });
        return route.abort();
      });
      await context.routeWebSocket("**/*", (route) => route.close());
      const page = await context.newPage();
      context.on("page", (popup) => {
        if (popup !== page) void popup.close().catch(() => {});
      });
      page.setDefaultTimeout(3000);
      await page.goto(destinationUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      return { context, page };
    } catch (error) {
      await context.close().catch(() => {});
      throw error;
    }
  }

  private async verifyPage(page: Page) {
    if (
      page.url() !== destinationUrl ||
      (await page
        .getByRole("heading", {
          name: "Fictional employment intake",
          exact: true,
        })
        .count()) !== 1 ||
      (await page.locator("form#intake").count()) !== 1 ||
      (await page.locator("#submission").textContent({ timeout: 1000 })) !== ""
    )
      throw Error("destinationPageChanged");
  }

  async test(destination: Workflow["destination"]) {
    validateDestination(destination);
    let opened;
    try {
      opened = await this.open();
      await this.verifyPage(opened.page);
    } catch (error) {
      throw Error(
        error instanceof Error && error.message === "destinationPageChanged"
          ? "destinationPageChanged"
          : "destinationBrowserUnavailable",
      );
    } finally {
      await opened?.context.close().catch(() => {});
    }
  }

  async execute(
    claim: Claim,
    mayContinue: () => boolean,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const { destination, instanceId, record } = claim;
    let opened: Awaited<ReturnType<EmploymentDestination["open"]>> | undefined;
    let writing = false;
    let retain = false;
    const abort = () => {
      void opened?.context.close().catch(() => {});
    };
    const check = () => {
      if (signal.aborted || !mayContinue()) throw Error("executionPaused");
    };
    try {
      validateDestination(destination);
      const values = Object.fromEntries(
        Object.entries(destination.fields).flatMap(([target, source]) =>
          Object.hasOwn(record.fields, source)
            ? [[target, record.fields[source]]]
            : [],
        ),
      );
      let requiredFields;
      try {
        requiredFields = employmentValues(values);
      } catch {
        return { kind: "failed", issue: { code: "destinationMissingInput" } };
      }
      check();
      await this.release(instanceId);
      opened = await this.open();
      signal.addEventListener("abort", abort, { once: true });
      const { page, context } = opened;
      check();
      await this.verifyPage(page);
      // Validate the initial visible controls before the first write. The adapter
      // checks page identity again as branch controls become visible.
      for (const { label } of requiredFields) {
        if ((await page.getByLabel(label, { exact: true }).count()) !== 1)
          throw Error("destinationPageChanged");
      }
      const report = await fillEmployment(page, values, async (write) => {
        check();
        await this.verifyPage(page);
        check();
        if (write) writing = true;
      });
      await this.verifyPage(page);
      check();
      this.reviews.set(instanceId, { context, page });
      retain = true;
      return report.mismatches.length
        ? {
            kind: "uncertain",
            report,
            issue: {
              code: "destinationReadbackMismatch",
              fields: report.mismatches,
            },
          }
        : { kind: "autofilled", report };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      const interrupted = signal.aborted || reason === "executionPaused";
      const changed = reason === "destinationPageChanged";
      const code = interrupted
        ? "executionInterrupted"
        : changed
          ? "destinationPageChanged"
          : writing
            ? "destinationInteractionFailed"
            : "destinationBrowserUnavailable";
      return {
        kind: writing ? "uncertain" : changed ? "failed" : "transient",
        issue: { code },
      };
    } finally {
      signal.removeEventListener("abort", abort);
      if (!retain) await opened?.context.close().catch(() => {});
    }
  }

  async reveal(instanceId: string) {
    const review = this.reviews.get(instanceId);
    if (!review || review.page.isClosed())
      throw Error("workflowReviewUnavailable");
    await review.page.bringToFront().catch(() => {
      throw Error("workflowReviewUnavailable");
    });
  }

  async release(instanceId: string) {
    const review = this.reviews.get(instanceId);
    this.reviews.delete(instanceId);
    await review?.context.close().catch(() => {});
  }

  async close() {
    this.reviews.clear();
    await this.browser?.close().catch(() => {});
  }

  reviewPage(instanceId: string) {
    return this.reviews.get(instanceId)?.page;
  }
}
