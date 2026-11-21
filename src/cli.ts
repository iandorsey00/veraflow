import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { exportHtml } from "./export";

const args = process.argv.slice(2);
const includeSourceName = args[0] === "--include-source-name";
if (includeSourceName) args.shift();
const [source, destination, ...extra] = args;

try {
  if (!source || extra.length) {
    throw new Error(
      "Usage: export-html [--include-source-name] <template.veraflow|template.vf> [form.html]",
    );
  }
  const filename = basename(source);
  const html = exportHtml(await readFile(source, "utf8"), filename, {
    includeSourceName,
  });
  const target =
    destination ??
    join(dirname(source), filename.replace(/\.(veraflow|vf)$/i, ".html"));
  if (!/\.html$/i.test(target)) throw new Error("Use an .html output path.");
  await writeFile(target, html, { encoding: "utf8", flag: "wx" });
  console.log(target);
} catch (error) {
  const exists =
    error instanceof Error && "code" in error && error.code === "EEXIST";
  console.error(
    exists
      ? "The output file already exists. Choose another path."
      : error instanceof Error
        ? error.message
        : error,
  );
  process.exitCode = 1;
}
