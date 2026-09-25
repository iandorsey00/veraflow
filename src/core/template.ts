// Names are nonempty Unicode runs excluding whitespace, controls, and delimiters.
// This excludes HTML attributes and prevents accidental multiline placeholders.
const placeholder = /<([^<>\s\p{Cc}\p{Cf}]+)>/gu;
export function parseFields(content: string): string[] {
  return [
    ...new Set([...content.matchAll(placeholder)].map((match) => match[1])),
  ];
}
export function orderFields(content: string, order: string[] = []): string[] {
  const parsed = parseFields(content);
  return [
    ...new Set([...order.filter((name) => parsed.includes(name)), ...parsed]),
  ];
}
export function renderTemplate(
  content: string,
  values: ReadonlyMap<string, string>,
): string {
  return content.replace(placeholder, (_, name: string) => {
    if (!values.has(name)) throw new Error("missingValue");
    return values.get(name)!;
  });
}
