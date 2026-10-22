import { defaultEmailOrder, type Template } from "./model";
type Style = Template["placeholderStyle"];
// Only backslash-backslash and backslash-opening-delimiter are escapes.
export function tokens(content: string, style: Style = "angle") {
  const pattern =
    style === "braces"
      ? /\\(?:\\|\{\{)|\{\{([^<>{}\p{Cc}\p{Cf}\u2028\u2029]+)\}\}/gu
      : /\\(?:\\|<)|<([^<>{}\s\p{Cc}\p{Cf}]+)>/gu;
  const out: { text: string; name?: string }[] = [];
  let end = 0;
  for (const match of content.matchAll(pattern)) {
    if (match.index! > end) out.push({ text: content.slice(end, match.index) });
    out.push(
      match[1]?.trim()
        ? {
            text: match[0],
            name: style === "braces" ? match[1].trim() : match[1],
          }
        : { text: match[1] !== undefined ? match[0] : match[0].slice(1) },
    );
    end = match.index! + match[0].length;
  }
  if (end < content.length) out.push({ text: content.slice(end) });
  return out;
}
export function parseFields(content: string, style: Style = "angle"): string[] {
  return [
    ...new Set(tokens(content, style).flatMap((t) => (t.name ? [t.name] : []))),
  ];
}
export function orderFields(
  content: string,
  order: string[] = [],
  style: Style = "angle",
): string[] {
  const parsed = parseFields(content, style);
  return [
    ...new Set([...order.filter((name) => parsed.includes(name)), ...parsed]),
  ];
}
export function renderTemplate(
  content: string,
  values: ReadonlyMap<string, string>,
  style: Style = "angle",
): string {
  return tokens(content, style)
    .map((token) => {
      if (!token.name) return token.text;
      if (!values.has(token.name)) throw new Error("missingValue");
      return values.get(token.name)!;
    })
    .join("");
}

export function emailSections(
  t: Template,
): { key: "subject" | "to" | "cc" | "bcc" | "body"; text: string }[] {
  if (!t.email?.enabled) return [{ key: "body", text: t.content }];
  const e = t.email;
  const headers = [
    ...new Set([...(e.order ?? defaultEmailOrder), ...defaultEmailOrder]),
  ];
  return [
    ...headers
      .filter(
        (key) =>
          key === "to" ||
          (key === "subject" && e.subjectEnabled !== false) ||
          (key === "cc" && e.ccEnabled) ||
          (key === "bcc" && e.bccEnabled),
      )
      .map((key) => ({ key, text: e[key] })),
    { key: "body" as const, text: t.content },
  ];
}
export function templateSource(t: Template): string {
  return emailSections(t)
    .map((s) => s.text)
    .join("\n");
}

// Keep inactive header fields in the saved order; sessions still use templateSource.
export function rememberedFieldOrder(template: Template): string[] {
  const email = template.email;
  return orderFields(
    [
      template.content,
      ...(email ? [email.subject, email.to, email.cc, email.bcc] : []),
    ].join("\n"),
    template.fieldOrder,
    template.placeholderStyle,
  );
}
