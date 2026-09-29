import type { Template } from "./model";
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

export function emailSections(
  t: Template,
): { key: "subject" | "to" | "cc" | "bcc" | "body"; text: string }[] {
  if (!t.email?.enabled) return [{ key: "body", text: t.content }];
  const e = t.email;
  return [
    { key: "subject" as const, text: e.subject },
    { key: "to" as const, text: e.to },
    ...(e.ccEnabled ? [{ key: "cc" as const, text: e.cc }] : []),
    ...(e.bccEnabled ? [{ key: "bcc" as const, text: e.bcc }] : []),
    { key: "body" as const, text: t.content },
  ];
}
export function templateSource(t: Template): string {
  return emailSections(t)
    .map((s) => s.text)
    .join("\n");
}
