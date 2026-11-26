import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, constants, stat } from "node:fs/promises";
import { basename, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { defaultComparison, defaultPreferences } from "./core/model";
import {
  planRecordValues,
  readRecordInput,
  recordInputLimit,
} from "./core/source-record";
import {
  activateFormStep,
  applyRecordChanges,
  prepareSections,
  prepareWorkflow,
  sectionText,
  startSession,
} from "./core/session";
import { parseSource, SourceSyntaxError } from "./core/source";
import { en } from "./locales/en";

const help = `VeraFlow · Render a JSON or JSON5 record with a VeraFlow form

Usage
  veraflow render <record> <form.vf> [--output-id <id>]
  veraflow pdf <record> <form.vf> [--output <path.pdf>] [--output-id <id>] [--force]

Use - as the record path to read JSON or JSON5 from stdin. With pdf, stdin
requires --output. Otherwise the PDF is saved beside the record by default.

Use --output-id to select a named output. A single output or a form's
defaultOutput is selected automatically. --force allows PDF replacement.

render writes Markdown to stdout. pdf prints the saved path.
PDF conversion uses locally installed Pandoc and XeLaTeX on macOS.
Use only trusted forms and record values for PDF conversion.`;

async function readText(filename: string, limit: number) {
  const stream = filename === "-" ? process.stdin : createReadStream(filename);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > limit)
      throw Error(
        filename === "-"
          ? "The input from stdin is too large."
          : `File is too large · ${filename}`,
      );
    chunks.push(chunk);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw Error(`Use UTF-8 text · ${filename === "-" ? "stdin" : filename}`);
  }
}

async function prepareMarkdown(record: string, form: string, choice?: string) {
  const content = await readText(form, 4 * recordInputLimit);
  if (!content.trim()) throw Error("The form file is empty.");
  const source = parseSource(content);
  if (source.snippets || source.workflow === "csv")
    throw Error("Choose a VeraFlow form that accepts a JSON record.");
  const output =
    choice ??
    source.defaultOutput ??
    (source.outputs.length === 1 ? source.outputs[0].id : undefined);
  const ids = source.outputs.map(({ id }) => id).join(", ");
  if (output === undefined)
    throw Error(
      `Choose an output with --output-id. Available outputs · ${ids}`,
    );
  if (!source.outputs.some(({ id }) => id === output))
    throw Error(`Unknown output "${output}". Available outputs · ${ids}`);

  const values = readRecordInput(await readText(record, recordInputLimit));
  const session = startSession({
    id: "cli",
    name: source.title ?? basename(form).replace(/\.(?:veraflow|vf)$/i, ""),
    folder: "",
    fieldOrder: [],
    placeholderStyle: "source",
    content,
    verificationEnabled: defaultPreferences.verificationDefault,
    comparison: defaultComparison,
  });
  session.unifiedForm = true;
  prepareWorkflow(session, true);
  applyRecordChanges(session, planRecordValues(session, values));

  if (source.steps) {
    const index = source.steps.findIndex((step) =>
      step.outputs.includes(output),
    );
    activateFormStep(session, index, output);
  } else {
    session.outputId = output;
  }
  return sectionText(prepareSections(session));
}

function errorMessage(reason: unknown) {
  if (reason instanceof SourceSyntaxError)
    return [reason.line && `Form line ${reason.line}`, reason.detail]
      .filter(Boolean)
      .join(" · ");
  const message = reason instanceof Error ? reason.message : String(reason);
  const colon = message.indexOf(":");
  const key = (
    colon < 0 ? message : message.slice(0, colon)
  ) as keyof typeof en;
  switch (key) {
    case "unverified":
      return "Verification is required. Check the fields in VeraFlow Desktop, save the prefilled form, and rerun with unchanged values.";
    case "incomplete":
    case "missingValue":
      return "The selected output needs more values. Fill the required fields in the JSON record or the form.";
    case "recordInputSyntax":
      return `Invalid JSON or JSON5 near line ${message.slice(colon + 1)}.`;
    case "recordUnknownField":
    case "recordInvalidField":
    case "recordInputDuplicate":
    case "recordInputNested":
    case "recordInputNumber":
      if (colon >= 0)
        return `${en[key]} ${JSON.stringify(message.slice(colon + 1))}`;
      break;
  }
  return Object.hasOwn(en, message) ? en[message as keyof typeof en] : message;
}

async function savePdf(markdown: string, destination: string, force: boolean) {
  if (process.platform !== "darwin")
    throw Error(
      "PDF conversion is available on macOS. Use render to produce Markdown.",
    );
  const helper = fileURLToPath(
    new URL("../src-tauri/target/debug/examples/pdf_cli", import.meta.url),
  );
  try {
    await access(helper, constants.X_OK);
  } catch {
    throw Error(
      "Build the PDF helper from the VeraFlow checkout with cargo build --manifest-path src-tauri/Cargo.toml --example pdf_cli.",
    );
  }
  const result = spawnSync(
    helper,
    [destination, ...(force ? ["--force"] : [])],
    {
      input: markdown,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const code = result.stderr.trim();
    switch (code) {
      case "pdfDestinationExists":
        throw Error(
          `Destination already exists · ${destination}. Use --force to replace it.`,
        );
      case "pdfPandocMissing":
        throw Error(
          "Pandoc was not found. Install it or select its executable in VeraFlow Desktop under Settings → PDF setup.",
        );
      case "pdfEngineMissing":
        throw Error(
          "XeLaTeX was not found. Install a TeX distribution with XeLaTeX or select its executable in VeraFlow Desktop under Settings → PDF setup.",
        );
      default:
        throw Error(
          code && Object.hasOwn(en, code)
            ? errorMessage(code)
            : "PDF conversion did not finish. Use render to check the prepared Markdown.",
        );
    }
  }
}

async function main(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string" },
      "output-id": { type: "string" },
      force: { type: "boolean" },
    },
  });
  if (values.help || args.length === 0) {
    console.log(help);
    return;
  }
  const [command, record, form] = positionals;
  if ((command !== "pdf" && command !== "render") || positionals.length !== 3)
    throw Error(
      "Use veraflow render or veraflow pdf with a record and form. See --help.",
    );
  if (form === "-") throw Error("Choose a form file on disk.");
  if (command === "render" && (values.output !== undefined || values.force))
    throw Error("--output and --force apply to pdf.");
  if (values["output-id"] === "")
    throw Error("--output-id needs an output ID.");
  if (
    command === "pdf" &&
    (values.output === "" || (record === "-" && !values.output))
  )
    throw Error("Supply a PDF path with --output.");

  const markdown = await prepareMarkdown(record, form, values["output-id"]);
  if (command === "render") {
    process.stdout.write(markdown);
    return;
  }
  const { dir, name } = parse(record);
  const destination = resolve(values.output ?? join(dir, `${name}.pdf`));
  // Reject writing over an input even if the destination is spelled through a different path.
  const existing = await stat(destination).catch(() => undefined);
  if (existing) {
    for (const filename of [record, form]) {
      if (filename === "-") continue;
      const input = await stat(filename);
      if (input.dev === existing.dev && input.ino === existing.ino)
        throw Error(
          "Choose a different PDF path to preserve the record and form.",
        );
    }
  }
  await savePdf(markdown, destination, values.force === true);
  console.log(destination);
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exitCode = 1;
  else throw error;
});
void main(process.argv.slice(2)).catch((reason: unknown) => {
  console.error(`veraflow: ${errorMessage(reason)}`);
  process.exitCode = 1;
});
