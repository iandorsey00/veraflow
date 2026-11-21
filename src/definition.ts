import { translate, type Message } from "./strings";
import {
  defaultComparison,
  type Template,
} from "../vendor/veraflow/core/model";
import {
  parseSource,
  sourceDefinitionText,
  SourceSyntaxError,
} from "../vendor/veraflow/core/source";

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

export function createDefinition(source: string, filename: string): Template {
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

  return {
    id: "standalone",
    name: parsed.title ?? fallback,
    folder: "",
    content,
    placeholderStyle: "source",
    fieldOrder: [],
    verificationEnabled: true,
    comparison: { ...defaultComparison },
  };
}
