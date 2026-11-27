import type { Comparison } from "./model";
export function normalize(value: string, rules: Comparison): string {
  let result = value.replace(/\r\n?/g, "\n");
  if (rules.unicode) result = result.normalize("NFC");
  if (!rules.caseSensitive) result = result.toLowerCase(); // locale-independent, not fuzzy matching
  if (rules.punctuation) result = result.replace(/\p{P}/gu, "");
  if (rules.mode === "whitespace") {
    result = rules.collapseLines
      ? result.trim().replace(/\s+/gu, " ")
      : result
          .split("\n")
          .map((line) => line.trim().replace(/[^\S\n]+/gu, " "))
          .join("\n")
          .trim();
  }
  return result;
}
export function compare(a: string, b: string, rules: Comparison): boolean {
  return normalize(a, rules) === normalize(b, rules);
}
// Bounded linear-time emphasis, not an expensive edit-distance matrix for large addresses.
export function difference(
  a: string,
  b: string,
): { before: string; middle: string; after: string }[] {
  const aa = Array.from(a),
    bb = Array.from(b);
  let start = 0,
    end = 0;
  while (start < Math.min(aa.length, bb.length) && aa[start] === bb[start])
    start++;
  while (
    end < Math.min(aa.length, bb.length) - start &&
    aa[aa.length - 1 - end] === bb[bb.length - 1 - end]
  )
    end++;
  return [aa, bb].map((chars) => ({
    before: chars.slice(0, start).join(""),
    middle: chars.slice(start, chars.length - end).join(""),
    after: end ? chars.slice(-end).join("") : "",
  }));
}
