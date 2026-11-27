import { createReadStream } from "node:fs";
import { link, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";
import { version } from "../package.json";
import {
  CliError,
  diagnostic,
  formatVersion,
  helpCatalog,
  helpText,
  outputFormats,
  parseCommand,
} from "./cli-options";
import { savePdf } from "./cli-pdf";
import { compareSourceText } from "./core/batch";
import {
  candidateFields,
  candidateFile,
  candidateFileLimit,
  extractCandidates,
  extractionFields,
  importCandidateFile,
  sourceTextLimit,
  validSourceText,
} from "./core/candidates";
import {
  csvRecord,
  csvRecords,
  delimitedRow,
  maxCSVBytes,
  spreadsheetText,
} from "./core/csv";
import {
  defaultComparison,
  defaultPreferences,
  type Session,
} from "./core/model";
import {
  planRecordValues,
  prefilledContent,
  readRecordInput,
  recordFormSource,
  recordInputLimit,
  recordValues,
} from "./core/source-record";
import {
  activateFormStep,
  applyRecordChanges,
  fieldRequiresVerification,
  formAttention,
  prepareSections,
  prepareWorkflow,
  sectionText,
  spreadsheetRow,
  startSession,
} from "./core/session";
import { parseSource } from "./core/source";
import { recordGaps } from "./core/gaps";
import {
  applyCollectionResponse,
  closeCollection,
  collectionQuestions,
  createCollectionResponse,
  prepareCollectionRequest,
  readCollectionRequest,
  readCollectionResponse,
  rememberCollection,
  reviewCollectionResponse,
} from "./core/collection";
import type { CollectionScope } from "./core/record-state";
import {
  applyTransformations,
  mapSourceRecord,
  planTransformations,
  readReviewedRecord,
  validatedRecord,
} from "./core/interoperability";

type Form = Awaited<ReturnType<typeof readForm>>;

async function readText(filename: string, limit: number) {
  const stream = filename === "-" ? process.stdin : createReadStream(filename);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > limit)
      throw new CliError(
        "inputTooLarge",
        `Input exceeds ${limit} bytes · ${filename === "-" ? "stdin" : JSON.stringify(filename)}`,
      );
    chunks.push(chunk);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new CliError(
      "invalidEncoding",
      `Use UTF-8 text · ${filename === "-" ? "stdin" : JSON.stringify(filename)}`,
    );
  }
}

async function readForm(filename: string) {
  if (filename === "-")
    throw new CliError("usage", "Choose a form file on disk.");
  const content = await readText(filename, 4 * recordInputLimit);
  if (!content.trim())
    throw new CliError("invalidSource", "The form file is empty.");
  const source = parseSource(content);
  const name = basename(filename)
    .replace(/\.(?:veraflow|vf)$/i, "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .slice(0, 250)
    .trim();
  return { source, content, title: source.title ?? (name || "VeraFlow form") };
}

function formSession(form: Form) {
  const session = startSession({
    id: "cli",
    name: form.title,
    folder: "",
    fieldOrder: [],
    placeholderStyle: "source",
    content: form.content,
    verificationEnabled: defaultPreferences.verificationDefault,
    comparison: defaultComparison,
  });
  session.unifiedForm = true;
  prepareWorkflow(session, true);
  return session;
}

async function readRecord(filename: string) {
  return readRecordInput(await readText(filename, recordInputLimit));
}

async function filledSession(form: Form, filename: string) {
  if (form.source.snippets || form.source.workflow === "csv")
    throw new CliError(
      "recordNeedsForm",
      "Choose a VeraFlow form that accepts a JSON record.",
    );
  const session = formSession(form);
  applyRecordChanges(
    session,
    planRecordValues(session, await readRecord(filename)),
  );
  return session;
}

async function sourceText(filename: string) {
  const text = await readText(filename, sourceTextLimit * 4);
  if (!validSourceText(text)) throw Error("batchSourceLimit");
  return text;
}

function outputIds(source: Form["source"], choice?: string, all = false) {
  const ids = source.outputs.map(({ id }) => id);
  if (all) return ids;
  const output =
    choice ?? source.defaultOutput ?? (ids.length === 1 ? ids[0] : undefined);
  if (output === undefined)
    throw new CliError(
      "outputRequired",
      `Choose an output with --output-id. Available outputs · ${ids.join(", ")}`,
      { outputs: ids },
    );
  if (!ids.includes(output))
    throw new CliError(
      "unknownOutput",
      `Unknown output ${JSON.stringify(output)}. Available outputs · ${ids.join(", ")}`,
      { outputs: ids },
    );
  return [output];
}

function recordScope(
  form: Form,
  options: { step?: string; "output-id"?: string },
): CollectionScope {
  if (
    options.step !== undefined ||
    (form.source.steps && options["output-id"] === undefined)
  ) {
    const step = Number(options.step ?? "1") - 1;
    if (!Number.isInteger(step) || !form.source.steps?.[step])
      throw new CliError("usage", "Choose an existing one-based step number.");
    return { step };
  }
  return { outputId: outputIds(form.source, options["output-id"])[0] };
}

async function writePrivateForm(file: string, content: string) {
  const destination = resolve(file);
  const folder = await mkdtemp(join(dirname(destination), ".veraflow-record-"));
  try {
    const temporary = join(folder, "record");
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await link(temporary, destination);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function selectOutput(session: Session, source: Form["source"], id: string) {
  if (source.steps)
    activateFormStep(
      session,
      source.steps.findIndex((step) => step.outputs.includes(id)),
      id,
    );
  else session.outputId = id;
}

function prepareOutput(session: Session, source: Form["source"], id: string) {
  selectOutput(session, source, id);
  try {
    return prepareSections(session);
  } catch (reason) {
    if (
      reason instanceof Error &&
      ["unverified", "missingValue", "incomplete"].includes(reason.message)
    ) {
      const fields = formAttention(session)
        .filter(({ check }) => check === (reason.message === "unverified"))
        .map(({ index }) => session.fields[index].name);
      const { code, message } = diagnostic(reason);
      throw new CliError(code, message, { outputId: id, fields });
    }
    throw reason;
  }
}

function renderedOutputs(
  session: Session,
  source: Form["source"],
  ids: string[],
) {
  let length = 0;
  return ids.map((id) => {
    const sections = prepareOutput(session, source, id);
    for (const { text } of sections) length += text.length;
    if (length > 16 * recordInputLimit)
      throw new CliError(
        "outputTooLarge",
        "The combined output is too large. Render one output at a time.",
      );
    return {
      id,
      label: source.outputs.find((output) => output.id === id)!.label,
      sections,
    };
  });
}

function inspectForm(form: Form) {
  const { source, title } = form;
  const session = formSession(form);
  return {
    format: "veraflow-form-info",
    version: formatVersion,
    title,
    kind: source.snippets ? "snippets" : "form",
    workflow: source.workflow ?? (source.snippets ? null : "form"),
    instructions: source.instructions,
    defaultOutput:
      source.defaultOutput ??
      (source.outputs.length === 1 ? source.outputs[0].id : null),
    outputs: source.outputs.map(
      ({ id, label, sections, row, instructions, references }) => ({
        id,
        label,
        instructions,
        sections: sections.map(({ id, label }) => ({ id, label })),
        columns: row?.map(({ id }) => id),
        references: [...references],
      }),
    ),
    steps: source.steps?.map(({ title, fields, outputs }) => ({
      title,
      fields,
      outputs,
    })),
    fields: extractionFields(session).fields.map((field, index) => {
      const control = session.controls?.get(field.id);
      return {
        ...field,
        optional: control?.optional ?? false,
        multiline: control?.multiline ?? control === undefined,
        allowBlankLines: control?.allowBlankLines,
        ...(control?.defaultValue === undefined
          ? {}
          : { default: control.defaultValue }),
        verify: fieldRequiresVerification(session, session.fields[index]),
        recordOnly: source.recordOnlyFields.includes(field.id),
      };
    }),
  };
}

function json(data: unknown) {
  process.stdout.write(JSON.stringify(data) + "\n");
}

function expectFormat(value: string, allowed: string[]) {
  if (!allowed.includes(value))
    throw new CliError("usage", `Use --format ${allowed.join(" or ")}.`);
  return value;
}

async function pdfDestination(record: string, form: string, output?: string) {
  if (record === "-" && output === undefined)
    throw new CliError("usage", "Supply a PDF path with --output.");
  const { dir, name } = parse(record);
  const destination = resolve(output ?? join(dir, `${name}.pdf`));
  const existing = await stat(destination).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
  if (existing) {
    // Compare file identity as the same file may be named by different paths.
    for (const filename of [record, form]) {
      if (filename === "-") continue;
      const input = await stat(filename);
      if (input.dev === existing.dev && input.ino === existing.ino)
        throw new CliError(
          "pdfDestination",
          "Choose a different PDF path to preserve the record and form.",
        );
    }
  }
  return destination;
}

async function main(args: string[]) {
  const {
    name,
    values,
    operands: [first, second, third],
  } = parseCommand(args);
  if (values.version) {
    if (values.json) json({ version });
    else console.log(version);
    return;
  }
  if (values.help || !name) {
    if (values.json) json(helpCatalog(name));
    else console.log(helpText(name));
    return;
  }
  switch (name) {
    case "inspect":
      json(inspectForm(await readForm(first)));
      return;
    case "fields":
      json(extractionFields(formSession(await readForm(first))));
      return;
    case "gaps":
    case "collection-request":
    case "record-export": {
      const form = await readForm(first);
      if (form.source.snippets || form.source.workflow === "csv")
        throw Error("recordNeedsForm");
      const scope = recordScope(form, values);
      const record =
        values.record === undefined
          ? undefined
          : await readRecord(values.record);
      const session = formSession(form);
      if (name === "gaps") {
        json(recordGaps(session, scope, record));
        return;
      }
      if (record)
        applyRecordChanges(session, planRecordValues(session, record));
      if (name === "record-export") {
        json(await validatedRecord(session, scope, values["include-history"]));
        return;
      }
      if (!values.output || !/\.(vf|veraflow)$/i.test(values.output))
        throw new CliError(
          "usage",
          "Use --output to save a new private .vf or .veraflow record.",
        );
      const { questions } = collectionQuestions(session, scope);
      const { request, link } = await prepareCollectionRequest(
        session,
        scope,
        questions.filter(
          ({ required }) => !values["required-only"] || required,
        ),
      );
      rememberCollection(session, link);
      await writePrivateForm(values.output, prefilledContent(session));
      json(request);
      return;
    }
    case "collection-inspect":
      json(readCollectionRequest(await readText(first, recordInputLimit)));
      return;
    case "collection-respond":
      json(
        createCollectionResponse(
          readCollectionRequest(await readText(first, recordInputLimit)),
          await readRecord(second),
        ),
      );
      return;
    case "collection-close": {
      if (!values["request-id"])
        throw new CliError(
          "usage",
          "Specify the request to close with --request-id.",
        );
      const session = formSession(await readForm(first));
      closeCollection(session, values["request-id"]);
      process.stdout.write(prefilledContent(session));
      return;
    }
    case "collection-review":
    case "collection-apply": {
      const session = formSession(await readForm(second));
      const response = readCollectionResponse(
        await readText(first, recordInputLimit),
      );
      if (name === "collection-review") {
        const review = await reviewCollectionResponse(session, response);
        json({
          format: "veraflow-collection-review",
          version: formatVersion,
          ...(review.status === "duplicate"
            ? review
            : {
                status: review.status,
                matching: review.matching,
                changes: review.changes.map(({ index, previous, value }) => ({
                  field: session.fields[index].name,
                  kind:
                    value === null
                      ? "clear"
                      : previous === null
                        ? "new"
                        : "conflict",
                  previous,
                  value,
                })),
              }),
        });
      } else {
        if (!values.accept)
          throw new CliError(
            "usage",
            "Review the changes with collection-review, then use --accept if you approve all changes.",
          );
        await applyCollectionResponse(
          session,
          response,
          new Set(response.fields.keys()),
        );
        process.stdout.write(prefilledContent(session));
      }
      return;
    }
    case "transformation-review":
    case "transformation-apply": {
      const session = formSession(await readForm(second));
      const changes = planTransformations(
        session,
        await readText(first, recordInputLimit),
      );
      if (name === "transformation-review") {
        json({
          format: "veraflow-transformation-review",
          version: formatVersion,
          changes: changes.map(({ index, ...change }) => ({
            field: session.fields[index].name,
            ...change,
          })),
        });
      } else {
        if (!values.accept)
          throw new CliError(
            "usage",
            "Review the proposal with transformation-review, then use --accept if you approve all changes.",
          );
        if (changes.length) applyTransformations(session, changes);
        process.stdout.write(prefilledContent(session));
      }
      return;
    }
    case "map": {
      const mapped = mapSourceRecord(
        await readText(first, recordInputLimit),
        await readText(second, recordInputLimit),
      );
      if (!values.form) json(Object.fromEntries(mapped));
      else {
        const form = await readForm(values.form);
        if (form.source.snippets || form.source.workflow === "csv")
          throw Error("recordNeedsForm");
        const session = formSession(form);
        applyRecordChanges(session, planRecordValues(session, mapped), {
          source: "mapped",
        });
        process.stdout.write(prefilledContent(session));
      }
      return;
    }
    case "record-inspect":
      json(
        await readReviewedRecord(await readText(first, recordInputLimit * 4)),
      );
      return;
    case "validate": {
      const form = await readForm(first);
      if (values.record === undefined) {
        if (values["output-id"] !== undefined || values.all)
          throw new CliError(
            "usage",
            "Supply --record before selecting an output to validate.",
          );
        json({ valid: true });
        return;
      }
      const session = await filledSession(form, values.record);
      const ids = outputIds(form.source, values["output-id"], values.all);
      for (const id of ids) prepareOutput(session, form.source, id);
      json({ valid: true, outputIds: ids });
      return;
    }
    case "normalize":
      json(Object.fromEntries(await readRecord(first)));
      return;
    case "create": {
      const record = await readRecord(first);
      const body =
        values.body === undefined
          ? ""
          : await readText(values.body, recordInputLimit);
      process.stdout.write(
        recordFormSource(values.title ?? "JSON form", record, body),
      );
      return;
    }
    case "merge":
    case "prefill": {
      const session = await filledSession(await readForm(second), first);
      if (name === "prefill") process.stdout.write(prefilledContent(session));
      else json(Object.fromEntries(recordValues(session)));
      return;
    }
    case "extract":
    case "candidates": {
      const fields = candidateFields(formSession(await readForm(second)));
      const candidates =
        name === "extract"
          ? extractCandidates(fields, await sourceText(first))
          : importCandidateFile(
              fields,
              await readText(first, candidateFileLimit),
              values.source === undefined
                ? undefined
                : await sourceText(values.source),
            );
      const result = JSON.stringify(candidateFile(candidates));
      if (Buffer.byteLength(result) + 1 > candidateFileLimit)
        throw Error("candidateLimit");
      process.stdout.write(result + "\n");
      return;
    }
    case "compare": {
      const session = await filledSession(await readForm(third), second);
      const record = recordValues(session);
      const fields = candidateFields(session).flatMap(
        ({ name, label, aliases }) => {
          const value = record.get(name);
          return value?.trim() ? [{ name, label, aliases, value }] : [];
        },
      );
      const results = compareSourceText(
        fields,
        await sourceText(first),
        session.template.comparison,
      ).map(({ evidence, ...result }) => ({
        ...result,
        evidence: evidence.slice(0, 5),
        evidenceCount: evidence.length,
      }));
      json({ format: "veraflow-comparison", version: formatVersion, results });
      return;
    }
    case "csv": {
      const data = csvRecords(await readText(first, maxCSVBytes), true);
      if (values.row === undefined)
        json({ headers: data.headers, rows: data.rows.length });
      else {
        const row = Number(values.row);
        if (!/^[1-9]\d*$/.test(values.row) || row > data.rows.length)
          throw new CliError(
            "csvRowOutOfRange",
            `Choose a 1-based row in the data. Available rows · ${data.rows.length}`,
          );
        json(Object.fromEntries(csvRecord(data, row - 1)));
      }
      return;
    }
    case "row": {
      const format = expectFormat(values.format ?? "json", outputFormats.row);
      const form = await readForm(second);
      const session = await filledSession(form, first);
      const [id] = outputIds(form.source, values["output-id"]);
      selectOutput(session, form.source, id);
      const cells = [...spreadsheetRow(session)];
      if (format === "json")
        json({
          format: "veraflow-row",
          version: formatVersion,
          outputId: id,
          cells: cells.map(([column, value]) => ({ column, value })),
        });
      else
        console.log(
          delimitedRow(
            cells.map(([, value]) => spreadsheetText(value)),
            format === "csv" ? "," : "\t",
          ),
        );
      return;
    }
    case "render":
    case "pdf": {
      const format = expectFormat(
        values.format ?? (values.all ? "json" : "text"),
        outputFormats[name],
      );
      if (values.all && format !== "json")
        throw new CliError("usage", "--all requires JSON output.");
      const destination =
        name === "pdf"
          ? await pdfDestination(first, second, values.output)
          : undefined;
      const form = await readForm(second);
      const ids = outputIds(form.source, values["output-id"], values.all);
      const session = await filledSession(form, first);
      const outputs = renderedOutputs(session, form.source, ids);
      if (destination !== undefined) {
        await savePdf(
          sectionText(outputs[0].sections),
          destination,
          values.force === true,
        );
        if (format === "json")
          json({
            format: "veraflow-pdf",
            version: formatVersion,
            path: destination,
            outputId: outputs[0].id,
          });
        else console.log(destination);
      } else if (format === "json")
        json({ format: "veraflow-render", version: formatVersion, outputs });
      else process.stdout.write(sectionText(outputs[0].sections));
    }
  }
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exitCode = 1;
  else throw error;
});
const args = process.argv.slice(2);
const endOfOptions = args.indexOf("--");
const jsonErrors = args
  .slice(0, endOfOptions === -1 ? undefined : endOfOptions)
  .includes("--json-errors");
void main(args).catch((reason: unknown) => {
  const error = diagnostic(reason);
  if (jsonErrors)
    console.error(
      JSON.stringify({
        format: "veraflow-error",
        version: formatVersion,
        error,
      }),
    );
  else console.error(`veraflow: ${error.message}`);
  process.exitCode = 1;
});
