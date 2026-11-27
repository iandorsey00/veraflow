import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { readReviewedRecord } from "../../../src/core/interoperability.ts";
import { fillEmployment } from "./destination-adapter.ts";

const file = process.argv[2];
if (!file || process.argv[3]) {
  console.error("Supply one flat or reviewed employment record JSON file.");
  process.exit(1);
}
const text = await readFile(file, "utf8");
const record = JSON.parse(text);
const fields =
  record?.format === "veraflow-reviewed-record"
    ? (await readReviewedRecord(text)).fields
    : record;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL("./destination.html", import.meta.url).href);
  const report = await fillEmployment(page, fields);
  console.log(JSON.stringify(report));
  if (report.mismatches.length) process.exitCode = 1;
} finally {
  await browser.close();
}
