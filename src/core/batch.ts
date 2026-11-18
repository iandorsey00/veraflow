import { normalize } from "./compare";
import type { Comparison } from "./model";

type Entry = { name: string; label: string; value: string };

export function compareSourceText(
  entries: Entry[],
  source: string,
  rules: Comparison,
) {
  const lines = source.split(/\r\n|\r|\n/).filter((line) => line.trim());
  const byLabel = new Map<string, string[]>();
  const byValue = new Map<string, string[]>();
  for (const line of lines) {
    const value = normalize(line, rules);
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value)!.push(line);
    const match = /^([^:：\t]+)[:：\t](.*)$/u.exec(line);
    if (!match) continue;
    const label = match[1].trim().toLowerCase();
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label)!.push(match[2].trim());
  }
  return entries.map((entry) => {
    const labels = new Set([
      entry.name.toLowerCase(),
      entry.label.toLowerCase(),
    ]);
    const candidates = [...labels].flatMap((label) => byLabel.get(label) ?? []);
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
