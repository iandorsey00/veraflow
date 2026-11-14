import { compare } from "./compare";
import {
  captureFieldNames,
  outputParts,
  templateControls,
  emailSections,
} from "./template";
import { validControlValue } from "./form";
import type { Session, Template, EmailHeader } from "./model";
export function verificationRequired(s: Session) {
  return s.typing
    ? s.template.typingVerification === true
    : s.template.verificationEnabled;
}
export function fieldVisible(s: Session, name: string) {
  const when = s.controls?.get(name)?.when;
  return (
    !when ||
    s.fields.find((field) => field.name === when.name)?.value === when.value
  );
}
function needsCapture(s: Session, field: Session["fields"][number]) {
  return (
    fieldVisible(s, field.name) &&
    (field.status === "empty" ||
      (field.status === "skipped" &&
        (s.typing === true || s.controls?.has(field.name) === true))) &&
    !s.controls?.get(field.name)?.optional
  );
}
function needsCheck(s: Session, field: Session["fields"][number]) {
  return (
    fieldVisible(s, field.name) &&
    field.value !== null &&
    field.status !== "verified"
  );
}
export function startSession(template: Template): Session {
  const controls = templateControls(template);
  const fields: Session["fields"] = captureFieldNames(template).map((name) => {
    const value = controls.get(name)?.defaultValue ?? null;
    return { name, value, status: value === null ? "empty" : "captured" };
  });
  const s: Session = {
    template: structuredClone(template),
    controls,
    fields,
    active: 0,
    mode: "capture",
  };
  if (!fields.length) s.mode = "ready";
  else if (controls.size) {
    const first = fields.findIndex((field) => needsCapture(s, field));
    if (first >= 0) s.active = first;
    else if (verificationRequired(s)) beginVerification(s);
    else s.mode = "ready";
  }
  return s;
}

export function prepareWorkflow(s: Session, typing: boolean) {
  s.typing = typing;
  for (const field of s.fields) {
    if (field.status === "verified" && !!field.checkedByTyping !== typing) {
      field.status = "captured";
      delete field.checkedByTyping;
    }
    if (field.status === "mismatch") {
      field.status = "captured";
      delete field.checkedByTyping;
      delete field.candidate;
    }
  }
  const first = s.fields.findIndex((field) => needsCapture(s, field));
  if (first >= 0) {
    s.mode = "capture";
    if (!typing) s.active = first;
  } else if (verificationRequired(s)) beginVerification(s);
  else s.mode = "ready";
}
function editable(s: Session) {
  if (s.mode === "complete") throw new Error("sessionComplete");
}
export function move(s: Session, offset: number): void {
  editable(s);
  const visible = s.fields.flatMap((field, index) =>
    fieldVisible(s, field.name) ? [index] : [],
  );
  if (!visible.length) return;
  const current = visible.indexOf(s.active);
  s.active =
    current < 0
      ? visible[0]
      : visible[(current + offset + visible.length) % visible.length];
}
export function capture(s: Session, value: string, advance = true): void {
  editable(s);
  if (!value.trim()) throw new Error("emptySelection");
  const field = s.fields[s.active];
  if (!field) throw new Error("noField");
  const control = s.controls?.get(field.name);
  if (control && !validControlValue(control, value))
    throw Error("invalidControlValue");
  field.value = field.removeBlankLines ? stripBlankLines(value) : value;
  field.status = "captured";
  delete field.checkedByTyping;
  delete field.candidate;
  s.mode = "capture";
  if (advance) advanceCapture(s);
}
export function clear(s: Session): void {
  editable(s);
  const field = s.fields[s.active];
  if (!field) return;
  field.value = null;
  field.status = "empty";
  delete field.removeBlankLines;
  delete field.checkedByTyping;
  delete field.candidate;
  s.mode = "capture";
}
export function skip(s: Session, advance = true): void {
  const control = s.controls?.get(s.fields[s.active]?.name);
  if (control && !control.optional) throw Error("incomplete");
  clear(s);
  const field = s.fields[s.active];
  if (!field) return;
  field.status = "skipped";
  if (advance) advanceCapture(s);
}
function advanceCapture(s: Session): void {
  const next = findNext(s, (field) => needsCapture(s, field));
  if (next !== -1) {
    s.active = next;
    return;
  }
  if (verificationRequired(s)) beginVerification(s);
  else s.mode = "ready";
}
function findNext(
  s: Session,
  predicate: (field: Session["fields"][number]) => boolean,
): number {
  for (let step = 1; step <= s.fields.length; step++) {
    const index = (s.active + step) % s.fields.length;
    if (predicate(s.fields[index])) return index;
  }
  return -1;
}
export function beginVerification(s: Session): void {
  editable(s);
  if (s.fields.some((field) => needsCapture(s, field)))
    throw new Error("incomplete");
  const index = s.fields.findIndex((field) => needsCheck(s, field));
  s.mode = index === -1 ? "ready" : "verify";
  if (index !== -1) s.active = index;
}
/** Recheck original values without replacing them or changing unrelated fields. */
export function beginReverification(s: Session, all = false): void {
  if (!["capture", "verify", "ready"].includes(s.mode))
    throw Error("sessionComplete");
  const indices = all
    ? s.fields.flatMap((field, index) =>
        fieldVisible(s, field.name) && field.value !== null ? [index] : [],
      )
    : s.fields[s.active]?.value != null
      ? [s.active]
      : [];
  if (!indices.length) throw Error("noValue");
  for (const index of indices) {
    s.fields[index].status = "captured";
    delete s.fields[index].candidate;
  }
  s.active = indices[0];
  s.mode = "verify";
}
export function verify(s: Session, candidate: string, advance = true): boolean {
  editable(s);
  if (s.mode !== "verify") throw new Error("notVerifying");
  const field = s.fields[s.active];
  if (!field || field.value === null) throw new Error("noValue");
  if (!candidate.trim()) throw new Error("emptySelection");
  if (field.removeBlankLines) candidate = stripBlankLines(candidate);
  const matches = s.controls?.get(field.name)?.options
    ? field.value === candidate
    : compare(field.value, candidate, s.template.comparison);
  field.status = matches ? "verified" : "mismatch";
  if (!matches) {
    field.candidate = candidate;
    return false;
  }
  delete field.checkedByTyping;
  delete field.candidate;
  if (s.typing) field.checkedByTyping = true;
  if (!s.fields.some((f) => needsCheck(s, f) || needsCapture(s, f)))
    s.mode = "ready";
  else if (advance) {
    const next = findNext(s, (f) => needsCheck(s, f));
    if (next !== -1) s.active = next;
    else s.mode = "capture";
  }
  return true;
}
function validateOutput(s: Session) {
  if (s.fields.some((f) => needsCapture(s, f))) throw Error("incomplete");
  if (verificationRequired(s) && s.fields.some((f) => needsCheck(s, f)))
    throw Error("unverified");
}

function renderParts(
  template: Template,
  values: ReadonlyMap<string, string>,
  controls: NonNullable<Session["controls"]>,
) {
  return emailSections(template).map((part) => ({
    key: part.key,
    parts: outputParts(
      part.text,
      template,
      values,
      controls,
      part.key !== "body",
    ),
  }));
}

export function renderTemplateValues(
  template: Template,
  input: ReadonlyMap<string, string>,
) {
  const controls = templateControls(template);
  const values = new Map(input);
  for (const [name, control] of controls) {
    if (!values.has(name)) {
      if (control.defaultValue !== undefined)
        values.set(name, control.defaultValue);
      else if (control.optional) values.set(name, "");
    }
  }
  const rendered = checkedParts(template, values, controls);
  return template.email?.enabled ? checkedEmail(template, rendered) : rendered;
}

function checkedParts(
  template: Template,
  values: ReadonlyMap<string, string>,
  controls: NonNullable<Session["controls"]>,
) {
  for (const [name, control] of controls) {
    if (control.when && values.get(control.when.name) !== control.when.value)
      continue;
    const value = values.get(name);
    if (value === undefined) throw Error("missingValue");
    if (
      !(control.optional && value === "") &&
      !validControlValue(control, value)
    )
      throw Error("invalidControlValue");
  }
  return renderParts(template, values, controls).map(({ key, parts }) => {
    if (parts.some((part) => part.missing)) throw Error("missingValue");
    const text = parts.map((part) => part.text).join("");
    return { key, text: key === "body" ? text : text.trim() };
  });
}

function sessionValues(s: Session) {
  return new Map(
    s.fields.flatMap((field) =>
      field.value !== null ||
      field.status === "skipped" ||
      s.controls?.get(field.name)?.optional
        ? [[field.name, field.value ?? ""] as const]
        : [],
    ),
  );
}

export function previewSections(template: Template, s?: Session) {
  const controls = s?.controls ?? templateControls(template);
  const values = s ? sessionValues(s) : new Map<string, string>();
  if (!s) {
    for (const [name, control] of controls) {
      if (control.defaultValue !== undefined)
        values.set(name, control.defaultValue);
      else if (control.optional) values.set(name, "");
    }
  }
  return renderParts(template, values, controls);
}

export function renderSession(s: Session): string {
  validateOutput(s);
  return checkedParts(
    s.template,
    sessionValues(s),
    s.controls ?? templateControls(s.template),
  ).find((part) => part.key === "body")!.text;
}
export function eraseSession(s: Session): void {
  for (const field of s.fields) {
    field.value = null;
    delete field.checkedByTyping;
    delete field.candidate;
    field.status = "empty";
    delete field.removeBlankLines;
  }
  delete s.scannerOutputTemplate;
  delete s.rowLink;
  delete s.scannerId;
  s.mode = "complete";
}

export class EmailHeaderError extends Error {
  constructor(public section: EmailHeader) {
    super("emailHeaderInvalid");
  }
}
export function renderEmail(s: Session) {
  validateOutput(s);
  return checkedEmail(
    s.template,
    checkedParts(
      s.template,
      sessionValues(s),
      s.controls ?? templateControls(s.template),
    ),
  );
}

function checkedEmail(
  template: Template,
  sections: { key: EmailHeader | "body"; text: string }[],
) {
  if (
    (template.email?.subjectEnabled !== false &&
      !sections.find((p) => p.key === "subject")?.text.trim()) ||
    !sections.find((p) => p.key === "to")?.text.trim()
  )
    throw new Error("emailRequired");
  for (const part of sections) {
    if (part.key !== "body" && /[\p{Cc}\p{Zl}\p{Zp}]/u.test(part.text))
      throw new EmailHeaderError(part.key);
  }
  return sections;
}

export async function deliverEmailSection(
  s: Session,
  back: boolean,
  send: (text: string | null, tab: boolean) => Promise<void>,
): Promise<void> {
  if (s.mode !== "delivery") throw new Error("emailNotReady");
  const parts = renderEmail(s),
    index = s.deliveryIndex ?? 0;
  if (back) {
    if (index === 0) return;
    await send(null, false);
    s.deliveryIndex = index - 1;
    s.deliveryDone = false;
  } else if (!s.deliveryDone) {
    await send(parts[index].text, index < parts.length - 1);
    if (index < parts.length - 1) s.deliveryIndex = index + 1;
    else s.deliveryDone = true;
  }
}

// Manual recovery only changes VeraFlow's section; never injects keys or claims paste success.
export function moveEmailSection(s: Session, direction: -1 | 1): void {
  if (s.mode !== "delivery") throw new Error("emailNotReady");
  const parts = renderEmail(s),
    index = s.deliveryIndex ?? 0;
  if (direction === -1) {
    if (s.deliveryDone) s.deliveryDone = false;
    else s.deliveryIndex = Math.max(0, index - 1);
  } else if (!s.deliveryDone) {
    if (index < parts.length - 1) s.deliveryIndex = index + 1;
    else s.deliveryDone = true;
  }
}

export function stripBlankLines(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}
export function cleanBlankLines(s: Session): void {
  editable(s);
  const field = s.fields[s.active];
  if (!field || field.value === null) throw new Error("noValue");
  const cleaned = stripBlankLines(field.value);
  if (cleaned === field.value) return;
  field.removeBlankLines = true;
  capture(s, cleaned, false);
  if (verificationRequired(s) && !s.fields.some((f) => needsCapture(s, f))) {
    s.mode = "verify";
  }
}
