import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { exportHtml } from "./export";
import { timestampedFilename } from "./filenames";
import { updateApp } from "./update";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "include-source-name": { type: "boolean" },
      "include-responses": { type: "boolean" },
      responses: { type: "string" },
      timestamp: { type: "boolean" },
      update: { type: "boolean" },
    },
  });
  if (values.update) {
    if (positionals.length || Object.keys(values).length !== 1)
      throw new Error("Use --update without export arguments.");
    await updateApp();
  } else {
    await exportFile(positionals, values);
  }
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

async function exportFile(
  [source, destination, ...extra]: string[],
  values: {
    timestamp?: boolean;
    "include-source-name"?: boolean;
    "include-responses"?: boolean;
    responses?: string;
  },
) {
  if (!source || extra.length) {
    throw new Error(
      "Usage: export-html [--include-source-name] [--include-responses] [--responses record.json] [--timestamp] <template.veraflow|template.vf> [form.html]\n       export-html --update",
    );
  }
  const filename = basename(source);
  const html = exportHtml(await readFile(source, "utf8"), filename, {
    includeSourceName: values["include-source-name"],
    includeResponses:
      values["include-responses"] || values.responses !== undefined,
    responseJson:
      values.responses === undefined
        ? undefined
        : await readFile(values.responses, "utf8"),
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
}
