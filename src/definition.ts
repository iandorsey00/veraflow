import { translate, type Message } from "./strings";
import {
  defaultComparison,
  type Template,
} from "../vendor/veraflow/core/model";
import {
  parseSource,
  prefillSource,
  sourceDefinitionText,
  SourceSyntaxError,
} from "../vendor/veraflow/core/source";

import {
  planRecordMerge,
  recordValues,
} from "../vendor/veraflow/core/source-record";
import {
  applyRecordChanges,
  startSession,
} from "../vendor/veraflow/core/session";

export class ExportError extends Error {
  constructor(
    public key: Message,
    public argument?: string,
    public detail?: string,
  ) {
    super([translate("en", key, argument), detail].filter(Boolean).join(" "));
  }
}
type Parsed = ReturnType<typeof parseSource>;
type Node = Parsed["outputs"][number]["sections"][number]["nodes"][number];

function unsupportedVariable(nodes: Node[]): string | undefined {
  for (const node of nodes) {
    if (typeof node === "string") continue;
    if (
      "variable" in node &&
      [
        "row",
        "rows",
        "csv_file",
        "clipboard",
        "selection",
        "selection-or-clipboard",
      ].includes(node.variable.name)
    )
      return node.variable.name;
    if ("loop" in node) {
      const found = unsupportedVariable(node.body);
      if (found) return found;
    }
    if ("condition" in node) {
      const found =
        unsupportedVariable(node.yes) ?? unsupportedVariable(node.no);
      if (found) return found;
    }
  }
}

export function sourceName(filename: string) {
  if (!/\.(veraflow|vf)$/i.test(filename))
    throw new ExportError("chooseSource");
  return (
    filename
      .replace(/\.(veraflow|vf)$/i, "")
      .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
      .slice(0, 250)
      .trim() || "VeraFlow form"
  );
}

export type PrefillOptions = {
  includeResponses?: boolean;
  responseJson?: string;
};

export function createDefinition(
  source: string,
  filename: string,
  options: PrefillOptions = {},
): Template {
  const fallback = sourceName(filename);
  if (!source.trim()) throw new ExportError("emptyFile");
  let content: string;
  try {
    content = sourceDefinitionText(source);
  } catch (error) {
    if (error instanceof SourceSyntaxError) {
      throw new ExportError(
        error.line ? "sourceLine" : "sourceError",
        error.line?.toString(),
        error.detail,
      );
    }
    throw error;
  }
  const parsed = parseSource(content);
  if (parsed.csv || parsed.workflow === "csv") throw new ExportError("csv");
  if (parsed.append || parsed.workflow === "append")
    throw new ExportError("appendCsv");
  if (parsed.snippets) throw new ExportError("snippets");
  for (const output of parsed.outputs) {
    for (const section of [...output.sections, ...(output.row ?? [])]) {
      const variable = unsupportedVariable(section.nodes);
      if (variable) throw new ExportError("variable", variable);
    }
  }

  const template: Template = {
    id: "standalone",
    name: parsed.title ?? fallback,
    folder: "",
    content,
    placeholderStyle: "source",
    fieldOrder: [],
    verificationEnabled: true,
    comparison: { ...defaultComparison },
  };
  if (!options.includeResponses) return template;
  const saved = new Map(parseSource(source).responses);
  if (options.responseJson !== undefined) {
    const session = startSession(template);
    try {
      applyRecordChanges(
        session,
        planRecordMerge(session, options.responseJson),
      );
      const values = recordValues(session);
      // Keep explicitly supplied keys even when their values equal the default.
      for (const name of Object.keys(JSON.parse(options.responseJson)))
        saved.set(name, values.get(name)!);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (detail.startsWith("recordUnknownField:"))
        throw new ExportError(
          "recordUnknownField",
          detail.slice("recordUnknownField:".length),
        );
      if (detail.startsWith("recordInvalidField:"))
        throw new ExportError(
          "recordInvalidField",
          detail.slice("recordInvalidField:".length),
        );
      throw new ExportError("invalidRecord");
    }
  }
  if (saved.size) {
    try {
      template.content = prefillSource(
        content,
        saved,
        parsed.workflow ?? "form",
      );
    } catch (error) {
      if (error instanceof SourceSyntaxError)
        throw new ExportError("sourceError", undefined, error.detail);
      throw error;
    }
  }
  return template;
}
