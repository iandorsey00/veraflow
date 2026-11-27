import { normalize } from "./compare";
import type { Comparison } from "./model";

export type SourceField = { name: string; label: string; aliases?: string[] };
type Entry = SourceField & { value: string };

export function sourceLabels(field: SourceField) {
  return new Set(
    [field.name, field.label, ...(field.aliases ?? [])].map((label) =>
      label.trim().toLowerCase(),
    ),
  );
}

export function labeledLines(source: string) {
  return source.split(/\r\n|\r|\n/).flatMap((quote, index) => {
    const match = /^([^:：\t]+)[:：\t](.*)$/u.exec(quote);
    return match
      ? [
          {
            label: match[1].trim().toLowerCase(),
            value: match[2].trim(),
            quote,
            line: index + 1,
          },
        ]
      : [];
  });
}

export function indexLabeledLines(source: string) {
  const byLabel = new Map<string, ReturnType<typeof labeledLines>>();
  for (const row of labeledLines(source)) {
    if (!byLabel.has(row.label)) byLabel.set(row.label, []);
    byLabel.get(row.label)!.push(row);
  }
  return byLabel;
}

export function compareSourceText(
  entries: Entry[],
  source: string,
  rules: Comparison,
) {
  const lines = source.split(/\r\n|\r|\n/).filter((line) => line.trim());
  const byLabel = indexLabeledLines(source);
  const byValue = new Map<string, string[]>();
  for (const line of lines) {
    const value = normalize(line, rules);
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value)!.push(line);
  }
  return entries.map((entry) => {
    const labels = sourceLabels(entry);
    const candidates = [...labels].flatMap((label) =>
      (byLabel.get(label) ?? []).map(({ value }) => value),
    );
    const expected = normalize(entry.value, rules);
    const matches = (value: string) => expected === normalize(value, rules);
    if (candidates.length)
      return {
        ...entry,
        status:
          candidates.length > 1
            ? "batchAmbiguous"
            : candidates.some(matches)
              ? "batchAssociated"
              : "batchConflict",
        evidence: candidates,
      } as const;
    const found = byValue.get(expected) ?? [];
    return {
      ...entry,
      status:
        found.length > 1
          ? "batchAmbiguous"
          : found.length
            ? "batchFound"
            : "batchMissing",
      evidence: found,
    } as const;
  });
}
