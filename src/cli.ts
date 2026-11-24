import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { exportHtml } from "./export";
import { timestampedFilename } from "./filenames";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "include-source-name": { type: "boolean" },
      timestamp: { type: "boolean" },
    },
  });
  const [source, destination, ...extra] = positionals;
  if (!source || extra.length) {
    throw new Error(
      "Usage: export-html [--include-source-name] [--timestamp] <template.veraflow|template.vf> [form.html]",
    );
  }
  const filename = basename(source);
  const html = exportHtml(await readFile(source, "utf8"), filename, {
    includeSourceName: values["include-source-name"],
  });
  const outputPath =
    destination ??
    join(dirname(source), filename.replace(/\.(veraflow|vf)$/i, ".html"));
  if (!/\.html$/i.test(outputPath))
    throw new Error("Use an .html output path.");
  const target = values.timestamp
    ? join(dirname(outputPath), timestampedFilename(basename(outputPath)))
    : outputPath;
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
