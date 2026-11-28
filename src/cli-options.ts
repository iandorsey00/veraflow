import { parseArgs } from "node:util";
import { version } from "../package.json";
import { SourceSyntaxError } from "./core/source";
import { en } from "./locales/en";

const options = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "V" },
  json: { type: "boolean" },
  "json-errors": { type: "boolean" },
  "output-id": { type: "string" },
  output: { type: "string" },
  force: { type: "boolean" },
  format: { type: "string" },
  all: { type: "boolean" },
  record: { type: "string" },
  title: { type: "string" },
  body: { type: "string" },
  source: { type: "string" },
  row: { type: "string" },
  step: { type: "string" },
  "required-only": { type: "boolean" },
  "include-history": { type: "boolean" },
  "request-id": { type: "string" },
  accept: { type: "boolean" },
  form: { type: "string" },
  state: { type: "string" },
  revision: { type: "string" },
  acknowledge: { type: "boolean" },
} as const;

type Option = keyof typeof options;
type Command = { args: string[]; flags: Option[]; description: string };

const commands = {
  "workflow-add": {
    args: ["workflow", "form"],
    flags: ["state"],
    description:
      "Register a portable workflow and blank form as an immutable revision.",
  },
  "workflow-create": {
    args: ["workflow-id"],
    flags: ["state", "revision", "source"],
    description:
      "Create a private workflow instance, optionally from a source record.",
  },
  "workflow-status": {
    args: [],
    flags: ["state"],
    description: "Show workflow instances, inbox results and worker status.",
  },
  "workflow-request": {
    args: ["instance-id"],
    flags: ["state"],
    description: "Prepare a native questionnaire request for an instance.",
  },
  "workflow-request-inspect": {
    args: ["instance-id", "request-id"],
    flags: ["state"],
    description: "Re-export a previously prepared questionnaire request.",
  },
  "workflow-link": {
    args: ["instance-id", "request-id", "respondent-url"],
    flags: ["state"],
    description: "Associate an existing questionnaire’s respondent link.",
  },
  "workflow-close": {
    args: ["instance-id", "request-id"],
    flags: ["state"],
    description: "Close a local questionnaire request after provider recovery.",
  },
  "workflow-import": {
    args: ["response"],
    flags: ["state"],
    description: "Import a native collection response file.",
  },
  "workflow-scan": {
    args: ["inbox-directory"],
    flags: ["state"],
    description:
      "Reconcile a response directory once without executing destinations.",
  },
  "workflow-values": {
    args: ["instance-id", "record"],
    flags: ["state"],
    description: "Supply or correct values in a workflow instance.",
  },
  "workflow-verify": {
    args: ["instance-id", "field-id", "independent-text"],
    flags: ["state"],
    description:
      "Compare a pending field with independent text from a file or stdin.",
  },
  "workflow-resolve": {
    args: ["instance-id", "response-id", "accept-or-keep"],
    flags: ["state"],
    description: "Resolve a conflicting response explicitly.",
  },
  "workflow-action": {
    args: ["instance-id", "queue-retry-cancel-or-complete"],
    flags: ["state", "acknowledge"],
    description: "Change destination execution state.",
  },
  "workflow-pause": {
    args: ["workflow-id", "on-or-off"],
    flags: ["state"],
    description: "Pause or resume autofill for all revisions of a workflow.",
  },
  "workflow-stop": {
    args: ["on-or-off"],
    flags: ["state"],
    description: "Stop or enable all local destination execution.",
  },
  "workflow-record": {
    args: ["instance-id"],
    flags: ["state"],
    description: "Export the validated record and provenance.",
  },
  "workflow-working-form": {
    args: ["instance-id"],
    flags: ["state"],
    description: "Export the editable working form and verification state.",
  },
  "workflow-test": {
    args: ["workflow-id"],
    flags: ["state", "revision"],
    description:
      "Check the configured fictional destination without populating fields.",
  },
  "workflow-worker": {
    args: ["inbox-directory"],
    flags: ["state"],
    description:
      "Watch the response inbox, run queued autofill and serve the local workflow controls.",
  },
  inspect: {
    args: ["form"],
    flags: [],
    description:
      "Describe fields, outputs, steps, and verification requirements as JSON.",
  },
  fields: {
    args: ["form"],
    flags: [],
    description:
      "Export the Desktop field definition for extraction tools as JSON.",
  },
  validate: {
    args: ["form"],
    flags: ["record", "output-id", "all"],
    description:
      "Validate a form or check whether a record is ready to render.",
  },
  gaps: {
    args: ["form"],
    flags: ["record", "output-id", "step"],
    description:
      "Report applicable gaps, deferred branches, and pending checks.",
  },
  "collection-request": {
    args: ["form"],
    flags: ["record", "output-id", "step", "required-only", "output"],
    description:
      "Write a private prefilled form to --output and print a minimal request.",
  },
  "collection-inspect": {
    args: ["request"],
    flags: [],
    description: "Validate and print a public collection request.",
  },
  "collection-respond": {
    args: ["request", "answers"],
    flags: [],
    description:
      "Build a correlated response from the request and a flat record of answers.",
  },
  "collection-review": {
    args: ["response", "prefilled-form"],
    flags: [],
    description: "Inspect correlated incoming changes without applying them.",
  },
  "collection-apply": {
    args: ["response", "prefilled-form"],
    flags: ["accept"],
    description:
      "With --accept, apply reviewed changes and print the updated prefilled form.",
  },
  "collection-close": {
    args: ["prefilled-form"],
    flags: ["request-id"],
    description:
      "Close a request in the current record and print the updated prefilled form.",
  },
  "transformation-review": {
    args: ["proposal", "prefilled-form"],
    flags: [],
    description:
      "Review proposed transformations against the current field values.",
  },
  "transformation-apply": {
    args: ["proposal", "prefilled-form"],
    flags: ["accept"],
    description:
      "With --accept, apply transformations with history and print an updated form.",
  },
  map: {
    args: ["source", "mapping"],
    flags: ["form"],
    description:
      "Map nested JSON to a flat VeraFlow record using explicit rules.",
  },
  "record-export": {
    args: ["form"],
    flags: ["record", "output-id", "step", "include-history"],
    description:
      "Export a complete, validated record without assigning human approval.",
  },
  "record-inspect": {
    args: ["reviewed-record"],
    flags: [],
    description: "Check a reviewed record envelope and its fingerprint.",
  },
  normalize: {
    args: ["record"],
    flags: [],
    description: "Convert a flat JSON or JSON5 record to strict JSON.",
  },
  create: {
    args: ["record"],
    flags: ["title", "body"],
    description:
      "Create a filled VeraFlow form with a summary or a custom output body.",
  },
  merge: {
    args: ["record", "form"],
    flags: [],
    description:
      "Apply record values to a form and export the resulting flat JSON.",
  },
  prefill: {
    args: ["record", "form"],
    flags: [],
    description: "Apply record values and write an editable prefilled form.",
  },
  extract: {
    args: ["text", "form"],
    flags: [],
    description: "Find labeled values and emit candidates with evidence.",
  },
  candidates: {
    args: ["candidate-file", "form"],
    flags: ["source"],
    description:
      "Validate and normalize a Desktop candidate file and optional evidence text.",
  },
  compare: {
    args: ["text", "record", "form"],
    flags: [],
    description:
      "Compare record values with labeled text and report the evidence.",
  },
  csv: {
    args: ["csv-file"],
    flags: ["row"],
    description: "Describe CSV columns or export one data row as flat JSON.",
  },
  row: {
    args: ["record", "form"],
    flags: ["output-id", "format"],
    description: "Produce a spreadsheet row as JSON, CSV, or TSV.",
  },
  render: {
    args: ["record", "form"],
    flags: ["output-id", "format", "all"],
    description: "Render a named output as text or structured JSON.",
  },
  pdf: {
    args: ["record", "form"],
    flags: ["output-id", "output", "force", "format"],
    description: "Render a PDF using local Pandoc and XeLaTeX on macOS.",
  },
} satisfies Record<string, Command>;

export const outputFormats = {
  render: ["text", "json"],
  pdf: ["text", "json"],
  row: ["json", "csv", "tsv"],
};

export const formatVersion = 1;

export class CliError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function parseCommand(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options,
  });
  const [command, ...operands] = positionals;
  if (command !== undefined && !Object.hasOwn(commands, command))
    throw new CliError(
      "unknownCommand",
      `Unknown command ${JSON.stringify(command)}. See --help.`,
    );
  const name = command as keyof typeof commands | undefined;
  const definition: Command | undefined = name ? commands[name] : undefined;
  if (values.help || values.version || !args.length)
    return { name, operands, values };
  if (!definition || operands.length !== definition.args.length)
    throw new CliError(
      "usage",
      name
        ? `Usage: ${usage(name)}. See ${name} --help.`
        : "Choose a command. See --help.",
    );
  for (const [flag, value] of Object.entries(values)) {
    if (flag === "json-errors") continue;
    if (!definition.flags.includes(flag as Option))
      throw new CliError("usage", `--${flag} is not available for ${name}.`);
    if (value === "") throw new CliError("usage", `--${flag} needs a value.`);
  }
  if (values.all && values["output-id"] !== undefined)
    throw new CliError("usage", "Choose either --all or --output-id.");
  if (values.step !== undefined && values["output-id"] !== undefined)
    throw new CliError("usage", "Choose either --step or --output-id.");
  const inputPaths = [...operands, values.record, values.source, values.body];
  if (inputPaths.filter((path) => path === "-").length > 1)
    throw new CliError("usage", "Use - for only one input.");
  return { name, operands, values };
}

function usage(name: keyof typeof commands) {
  const command: Command = commands[name];
  return [
    "veraflow",
    name,
    ...command.args.map((arg) => `<${arg}>`),
    ...command.flags.map(
      (flag) =>
        `[--${flag}${options[flag].type === "string" ? " <value>" : ""}]`,
    ),
  ].join(" ");
}

export function helpText(name?: keyof typeof commands) {
  const all = name
    ? [name]
    : (Object.keys(commands) as (keyof typeof commands)[]);
  return `VeraFlow ${version}

Usage
${all.map((key) => `  ${usage(key)}\n    ${commands[key].description}`).join("\n")}

Use - for one data input to read UTF-8 from stdin. Form files are read from disk.
Use --help --json for a command catalog and --json-errors for JSON on stderr.
Use --version to print the installed version.
Multi-output forms need --output-id unless they declare a default or you use --all.
render defaults to text. Use --format json for named sections or --all.
pdf reads from stdin only with --output and requires --force for replacement.
Workflow commands use a local state directory. Set --state to use a separate workspace.
Use only trusted forms and data with PDF conversion.`;
}

export function helpCatalog(name?: keyof typeof commands) {
  const all = name
    ? [name]
    : (Object.keys(commands) as (keyof typeof commands)[]);
  return {
    format: "veraflow-cli",
    version: formatVersion,
    appVersion: version,
    commands: all.map((key) => {
      const command: Command = commands[key];
      return {
        name: key,
        ...command,
        flags: command.flags.map((flag) => ({
          name: flag,
          type: options[flag].type,
          choices:
            flag === "format"
              ? outputFormats[key as keyof typeof outputFormats]
              : undefined,
        })),
        usage: usage(key),
      };
    }),
  };
}

export function diagnostic(reason: unknown) {
  if (reason instanceof CliError)
    return { code: reason.code, message: reason.message, ...reason.details };
  if (reason instanceof SourceSyntaxError)
    return {
      code: "invalidSource",
      message: [reason.line && `Form line ${reason.line}`, reason.detail]
        .filter(Boolean)
        .join(" · "),
      line: reason.line,
    };
  const message = reason instanceof Error ? reason.message : String(reason);
  const colon = message.indexOf(":");
  const key = (
    colon < 0 ? message : message.slice(0, colon)
  ) as keyof typeof en;
  const detail = message.slice(colon + 1);
  switch (key) {
    case "unverified":
      return {
        code: key,
        message:
          "Verification is required. Check the fields in VeraFlow Desktop, save the prefilled form, and rerun with unchanged values.",
      };
    case "incomplete":
    case "missingValue":
      return {
        code: key,
        message:
          "The selected output needs more values. Fill the required fields in the JSON record or the form.",
      };
    case "recordInputSyntax":
      return {
        code: key,
        message: `Invalid JSON or JSON5 near line ${detail}.`,
        line: Number(detail),
      };
    case "recordUnknownField":
    case "recordInvalidField":
    case "recordInputDuplicate":
    case "recordInputNested":
    case "recordInputNumber":
      if (colon >= 0)
        return {
          code: key,
          message: `${en[key]} ${JSON.stringify(detail)}`,
          field: detail,
        };
      break;
  }
  if (Object.hasOwn(en, message))
    return { code: message, message: en[message as keyof typeof en] };
  const native = reason as NodeJS.ErrnoException | null;
  if (native?.code?.startsWith("ERR_PARSE_ARGS"))
    return { code: "usage", message };
  if (native?.code && native.path)
    return {
      code: "fileAccess",
      message: `Could not access ${JSON.stringify(native.path)} (${native.code}).`,
    };
  return {
    code: "unexpectedError",
    message: "VeraFlow could not finish the command.",
  };
}
