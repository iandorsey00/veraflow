import { parseSource } from "./source";
import {
  formDirective,
  validControlValue,
  type Control,
  type Directive,
} from "./form";
import { defaultEmailOrder, type Template } from "./model";
type Style = Template["placeholderStyle"];
// Only backslash-backslash and backslash-opening-delimiter are escapes.
export function tokens(
  content: string,
  style: Style = "angle",
  withControls = false,
) {
  const pattern =
    style === "braces" && withControls
      ? /\\(?:\\|\{\{)|\{\{(\s*(?:(?:select|radio|dropdown|checkbox|switch|choice|text|textarea|email|date|number) [\w-]+\??|when [\w-]+[^\S\r\n]*=[^\S\r\n]*[\w-]+):(?:[^"<>{}\p{Cc}\p{Cf}\u2028\u2029]|"(?:[^"\\\p{Cc}\p{Cf}]|\\[^\p{Cc}\p{Cf}])*")*)\}\}|\{\{([^<>{}\p{Cc}\p{Cf}\u2028\u2029]+)\}\}/gu
      : style === "braces"
        ? /\\(?:\\|\{\{)|\{\{([^<>{}\p{Cc}\p{Cf}\u2028\u2029]+)\}\}/gu
        : /\\(?:\\|<)|<([^<>{}\s\p{Cc}\p{Cf}]+)>/gu;
  const out: { text: string; name?: string }[] = [];
  let end = 0;
  for (const match of content.matchAll(pattern)) {
    if (match.index! > end) out.push({ text: content.slice(end, match.index) });
    const name = match[1] ?? match[2];
    out.push(
      name?.trim()
        ? {
            text: match[0],
            name: style === "braces" ? name.trim() : name,
          }
        : { text: name !== undefined ? match[0] : match[0].slice(1) },
    );
    end = match.index! + match[0].length;
  }
  if (end < content.length) out.push({ text: content.slice(end) });
  return out;
}
export function templateTokens(content: string, style: Style) {
  return tokens(content, style, true).map((token) => ({
    ...token,
    directive: token.name
      ? style === "braces"
        ? formDirective(token.name)
        : ({ name: token.name } as Directive)
      : undefined,
  }));
}

export function templateControls(template: Template) {
  if (template.placeholderStyle === "source")
    return parseSource(template.content).controls;
  const parts = emailSections(template).flatMap((part) =>
    templateTokens(part.text, template.placeholderStyle),
  );
  const controls = new Map<string, Control>();
  for (const { directive } of parts) {
    if (!directive?.control) continue;
    const { name, control } = directive;
    if (controls.has(name)) throw Error("invalidFormDirective");
    controls.set(name, control);
  }
  for (const [name, control] of controls) {
    if (
      control.when &&
      !controls.get(control.when.name)?.options?.has(control.when.value)
    )
      throw Error("invalidFormDirective");
    if (
      control.defaultValue !== undefined &&
      !validControlValue(control, control.defaultValue)
    )
      throw Error("invalidFormDirective");
    if (template.extraFields?.includes(name))
      throw Error("invalidFormDirective");
  }
  for (const { directive } of parts) {
    if (!directive?.choices) continue;
    const selected = controls.get(directive.name)?.options;
    if (
      !selected ||
      [...directive.choices.keys()].some((key) => !selected.has(key))
    )
      throw Error("invalidFormDirective");
  }
  return controls;
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

export function outputParts(
  text: string,
  template: Template,
  values: ReadonlyMap<string, string>,
  controls: ReadonlyMap<string, Control>,
  header = false,
) {
  return templateTokens(text, template.placeholderStyle).map(
    ({ text, directive }) => {
      if (!directive) return { text, missing: false };
      const control = controls.get(directive.name);
      if (control?.when && values.get(control.when.name) !== control.when.value)
        return { text: "", missing: false };
      const value = values.get(directive.name);
      if (value === undefined) return { text, missing: true };
      const options = directive.choices ?? control?.options;
      const output = options && value ? (options.get(value) ?? "") : value;
      return { text: header ? output.trim() : output, missing: false };
    },
  );
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
  return captureFieldNames(template, true);
}

// Extra fields participate in capture/verification only; never synthesize output tokens.
export function validateExtraFields(
  value: unknown,
): asserts value is string[] | undefined {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    new Set(value).size !== value.length ||
    value.some(
      (n) =>
        typeof n !== "string" ||
        !n.trim() ||
        n !== n.trim() ||
        n.length > 250 ||
        /[\p{Cc}\p{Cf}<>{}\u2028\u2029]/u.test(n),
    )
  )
    throw Error("invalidExtraFields");
}
export function captureFieldNames(
  template: Template,
  allHeaders = false,
): string[] {
  if (template.placeholderStyle === "source") {
    try {
      return parseSource(template.content).fields;
    } catch {
      return [];
    }
  }
  validateExtraFields(template.extraFields);
  const source = allHeaders
    ? [
        template.content,
        ...(template.email
          ? [
              template.email.subject,
              template.email.to,
              template.email.cc,
              template.email.bcc,
            ]
          : []),
      ].join("\n")
    : templateSource(template);
  const names = [
    ...new Set([
      ...tokens(source, template.placeholderStyle, true).flatMap(({ name }) => {
        if (!name) return [];
        if (template.placeholderStyle !== "braces") return [name];
        try {
          return [formDirective(name).name];
        } catch {
          return [name];
        } // The editor can display incomplete directives while typing.
      }),
      ...(template.extraFields ?? []),
    ]),
  ];
  return [
    ...new Set([
      ...template.fieldOrder.filter((n) => names.includes(n)),
      ...names,
    ]),
  ];
}
