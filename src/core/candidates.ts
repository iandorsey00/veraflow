import { readExchangeJSON } from "./exchange-json";
import { indexLabeledLines, sourceLabels, type SourceField } from "./batch";
import { normalizeText, validControlValue, type Control } from "./form";
import type { Session } from "./model";

export const sourceTextLimit = 65_536;
export const candidateFileLimit = 1024 * 1024;
const valueLimit = 8192;
const alternativeLimit = 20;
const evidenceLimit = 5;

export type Evidence = { quote: string; line?: number; source_id?: string };
type Alternative = {
  value: string;
  origin: "direct" | "inferred";
  evidence: Evidence[];
};
export type Candidate = {
  status: "found" | "ambiguous" | "invalid" | "not_found";
  alternatives: Alternative[];
};

type CandidateField = SourceField & { control?: Control };

export function candidateFields(s: Session): CandidateField[] {
  return s.fields.map(({ name }) => {
    const control = s.controls?.get(name);
    return {
      name,
      label: control?.label?.trim() || name,
      aliases: control?.aliases,
      control,
    };
  });
}

export function extractionFields(s: Session) {
  return {
    format: "veraflow-extraction-fields",
    version: 1,
    fields: candidateFields(s).map(({ name, label, aliases, control }) => ({
      id: name,
      label,
      aliases,
      type: control?.kind ?? "text",
      instructions: control?.instructions,
      options:
        control?.options &&
        [...control.options.keys()].map((id) => ({
          id,
          label: control.optionLabels?.get(id) ?? id,
        })),
    })),
  };
}

export function validSourceText(source: string) {
  return (
    source.trim() !== "" &&
    source.length <= sourceTextLimit &&
    !source.includes("\0")
  );
}

function usable(control: Control | undefined, value: string) {
  return (
    value.length <= valueLimit &&
    !!value.trim() &&
    !value.includes("\0") &&
    (!control || validControlValue(control, value))
  );
}

export function extractCandidates(fields: CandidateField[], source: string) {
  if (!validSourceText(source)) throw Error("batchSourceLimit");
  const owners = new Map<string, Set<string>>();
  for (const field of fields)
    for (const label of sourceLabels(field)) {
      if (!owners.has(label)) owners.set(label, new Set());
      owners.get(label)!.add(field.name);
    }
  const indexed = indexLabeledLines(source);
  return new Map(
    fields.map((field): [string, Candidate] => {
      const alternatives = new Map<string, Alternative>();
      const control = field.control;
      let ambiguous = false;
      const rows = [...sourceLabels(field)]
        .flatMap((label) => indexed.get(label) ?? [])
        .sort((a, b) => a.line - b.line);
      for (const row of rows) {
        if (!row.value) continue;
        if (row.value.length > valueLimit || row.quote.length > valueLimit)
          throw Error("candidateLimit");
        const optionIds =
          control?.options && !control.options.has(row.value)
            ? [...(control.optionLabels ?? [])]
                .filter(([, label]) => label === row.value)
                .map(([id]) => id)
            : [];
        if (owners.get(row.label)!.size > 1 || optionIds.length > 1)
          ambiguous = true;
        for (const raw of optionIds.length ? optionIds : [row.value]) {
          const value = normalizeText(control, raw);
          let candidate = alternatives.get(value);
          if (!candidate) {
            if (alternatives.size === alternativeLimit)
              throw Error("candidateLimit");
            candidate = { value, origin: "direct", evidence: [] };
            alternatives.set(value, candidate);
          }
          if (candidate.evidence.length < evidenceLimit)
            candidate.evidence.push({ quote: row.quote, line: row.line });
        }
      }
      const found = [...alternatives.values()];
      const status = !found.length
        ? "not_found"
        : ambiguous || found.length > 1
          ? "ambiguous"
          : usable(control, found[0].value)
            ? "found"
            : "invalid";
      return [field.name, { status, alternatives: found }];
    }),
  );
}

export function candidateFile(candidates: ReadonlyMap<string, Candidate>) {
  return {
    format: "veraflow-candidates",
    version: 1,
    candidates: Object.fromEntries(candidates),
  };
}

function strictJSON(text: string): unknown {
  if (new TextEncoder().encode(text).length > candidateFileLimit)
    throw Error("candidateLimit");
  return readExchangeJSON(text, candidateFileLimit, "invalidCandidateFile", 8);
}

function object(value: unknown, allowed?: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (allowed && Object.keys(value).some((key) => !allowed.includes(key)))
  )
    throw Error("invalidCandidateFile");
  return value as Record<string, unknown>;
}

function nonblank(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= limit &&
    !value.includes("\0")
  );
}

export function importCandidateFile(
  fields: CandidateField[],
  text: string,
  source?: string,
) {
  const file = object(strictJSON(text), ["format", "version", "candidates"]);
  if (file.format !== "veraflow-candidates" || file.version !== 1)
    throw Error("invalidCandidateFile");
  const controls = new Map(fields.map((field) => [field.name, field.control]));
  if (source !== undefined && !validSourceText(source))
    throw Error("batchSourceLimit");
  const lines = source?.split(/\r\n|\r|\n/);
  const normalizedSource = lines?.join("\n");
  const result = new Map<string, Candidate>();
  for (const [name, raw] of Object.entries(object(file.candidates))) {
    if (!controls.has(name)) throw Error("recordUnknownField:" + name);
    const { status, alternatives } = object(raw, ["status", "alternatives"]);
    if (
      (status !== "found" &&
        status !== "ambiguous" &&
        status !== "invalid" &&
        status !== "not_found") ||
      !Array.isArray(alternatives) ||
      alternatives.length > alternativeLimit ||
      (status === "not_found"
        ? alternatives.length !== 0
        : status === "ambiguous"
          ? alternatives.length === 0
          : alternatives.length !== 1)
    )
      throw Error("invalidCandidateFile");
    const seen = new Set<string>();
    const control = controls.get(name);
    result.set(name, {
      status,
      alternatives: alternatives.map((entry): Alternative => {
        const { value, origin, evidence } = object(entry, [
          "value",
          "origin",
          "evidence",
        ]);
        if (
          !nonblank(value, valueLimit) ||
          seen.has(value) ||
          normalizeText(control, value) !== value ||
          (origin !== "direct" && origin !== "inferred") ||
          !Array.isArray(evidence) ||
          evidence.length > evidenceLimit
        )
          throw Error("invalidCandidateFile");
        seen.add(value);
        if (
          (status === "found" && !usable(control, value)) ||
          (status === "invalid" && usable(control, value))
        )
          throw Error("recordInvalidField:" + name);
        return {
          value,
          origin,
          evidence: evidence.map((item): Evidence => {
            const { quote, line, source_id } = object(item, [
              "quote",
              "line",
              "source_id",
            ]);
            if (
              !nonblank(quote, valueLimit) ||
              (line !== undefined &&
                (typeof line !== "number" ||
                  !Number.isSafeInteger(line) ||
                  line < 1 ||
                  line > sourceTextLimit)) ||
              (source_id !== undefined && !nonblank(source_id, 250))
            )
              throw Error("invalidCandidateFile");
            if (normalizedSource !== undefined) {
              const quotedLines = quote.split(/\r\n|\r|\n/);
              const actual =
                typeof line === "number"
                  ? lines!
                      .slice(line - 1, line - 1 + quotedLines.length)
                      .join("\n")
                  : normalizedSource;
              if (!actual.includes(quotedLines.join("\n")))
                throw Error("candidateEvidenceMismatch");
            }
            return {
              quote,
              line: typeof line === "number" ? line : undefined,
              source_id: typeof source_id === "string" ? source_id : undefined,
            };
          }),
        };
      }),
    });
  }
  return result;
}
