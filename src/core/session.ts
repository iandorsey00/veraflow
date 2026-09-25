import { compare } from "./compare";
import { orderFields, renderTemplate } from "./template";
import type { Session, Template } from "./model";
export function startSession(template: Template): Session {
  const fields = orderFields(template.content, template.fieldOrder).map(
    (name) => ({ name, value: null, status: "empty" as const }),
  );
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
  field.value = value;
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
  );
}
export function eraseSession(s: Session): void {
  for (const field of s.fields) {
    field.value = null;
    delete field.candidate;
    field.status = "empty";
  }
  s.mode = "complete";
}
