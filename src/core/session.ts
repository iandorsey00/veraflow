import { compare } from "./compare";
import {
  orderFields,
  renderTemplate,
  templateSource,
  emailSections,
} from "./template";
import type { Session, Template } from "./model";
export function startSession(template: Template): Session {
  const fields = orderFields(
    templateSource(template),
    template.fieldOrder,
    template.placeholderStyle,
  ).map((name) => ({ name, value: null, status: "empty" as const }));
  return {
    template: structuredClone(template),
    fields,
    active: 0,
    mode: fields.length ? "capture" : "ready",
  };
}
function editable(s: Session) {
  if (s.mode === "complete") throw new Error("sessionComplete");
}
export function move(s: Session, offset: number): void {
  editable(s);
  if (!s.fields.length) return;
  s.active = (s.active + offset + s.fields.length) % s.fields.length;
}
export function capture(s: Session, value: string, advance = true): void {
  editable(s);
  if (!value.trim()) throw new Error("emptySelection");
  const field = s.fields[s.active];
  if (!field) throw new Error("noField");
  field.value = field.removeBlankLines ? stripBlankLines(value) : value;
  field.status = "captured";
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
  delete field.candidate;
  s.mode = "capture";
}
export function skip(s: Session, advance = true): void {
  clear(s);
  const field = s.fields[s.active];
  if (!field) return;
  field.status = "skipped";
  if (advance) advanceCapture(s);
}
function advanceCapture(s: Session): void {
  const next = findNext(s, (field) => field.status === "empty");
  if (next !== -1) {
    s.active = next;
    return;
  }
  if (s.template.verificationEnabled) beginVerification(s);
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
  if (s.fields.some((field) => field.status === "empty"))
    throw new Error("incomplete");
  const index = s.fields.findIndex(
    (field) => field.value !== null && field.status !== "verified",
  );
  s.mode = index === -1 ? "ready" : "verify";
  if (index !== -1) s.active = index;
}
export function verify(s: Session, candidate: string, advance = true): boolean {
  editable(s);
  if (s.mode !== "verify") throw new Error("notVerifying");
  const field = s.fields[s.active];
  if (!field || field.value === null) throw new Error("noValue");
  if (!candidate.trim()) throw new Error("emptySelection");
  if (field.removeBlankLines) candidate = stripBlankLines(candidate);
  const matches = compare(field.value, candidate, s.template.comparison);
  field.status = matches ? "verified" : "mismatch";
  if (!matches) {
    field.candidate = candidate;
    return false;
  }
  delete field.candidate;
  if (s.fields.every((f) => f.status === "verified" || f.status === "skipped"))
    s.mode = "ready";
  else if (advance)
    s.active = findNext(s, (f) => f.value !== null && f.status !== "verified");
  return true;
}
export function renderSession(s: Session): string {
  if (s.fields.some((f) => f.status === "empty")) throw new Error("incomplete");
  if (
    s.template.verificationEnabled &&
    s.fields.some((f) => f.status !== "skipped" && f.status !== "verified")
  )
    throw new Error("unverified");
  return renderTemplate(
    s.template.content,
    new Map(s.fields.map((f) => [f.name, f.value ?? ""])),
    s.template.placeholderStyle,
  );
}
export function eraseSession(s: Session): void {
  for (const field of s.fields) {
    field.value = null;
    delete field.candidate;
    field.status = "empty";
    delete field.removeBlankLines;
  }
  s.mode = "complete";
}

export function renderEmail(s: Session) {
  renderSession(s); // Apply the same completeness and verification gate to every section.
  const values = new Map(s.fields.map((f) => [f.name, f.value ?? ""]));
  const sections = emailSections(s.template).map((part) => ({
    ...part,
    text: renderTemplate(part.text, values, s.template.placeholderStyle),
  }));
  if (
    (s.template.email?.subjectEnabled !== false &&
      !sections.find((p) => p.key === "subject")?.text.trim()) ||
    !sections.find((p) => p.key === "to")?.text.trim()
  )
    throw new Error("emailRequired");
  if (sections.some((p) => p.key !== "body" && /[\p{Cc}]/u.test(p.text)))
    throw new Error("emailHeaderInvalid");
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
  if (
    s.template.verificationEnabled &&
    s.fields.every((f) => f.status !== "empty")
  ) {
    s.mode = "verify";
  }
}
