import type { Preferences, Session, Template } from "./model";
import { startSession, capture } from "./session";

export function startScanner(preferences: Preferences, name: string): Session {
  const session = startSession({
    id: "scanner",
    name,
    folder: "",
    content: "",
    fieldOrder: [],
    verificationEnabled: preferences.verificationDefault,
    comparison: structuredClone(preferences.comparison),
  });
  session.scanner = true;
  addScannerField(session, "1");
  return session;
}
export function addScannerField(session: Session, name: string) {
  name = name.trim();
  if (
    !name ||
    name.length > 250 ||
    /[\p{Cc}\p{Cf}]/u.test(name) ||
    session.fields.some((f) => f.name === name)
  )
    throw Error("scannerFieldInvalid");
  if (session.fields.length >= 1000) throw Error("scannerFieldInvalid");
  session.fields.push({ name, value: null, status: "empty" });
  session.active = session.fields.length - 1;
  session.mode = "capture";
}
export function captureScanner(
  session: Session,
  value: string,
  advance: boolean,
) {
  capture(session, value, false);
  if (advance) {
    for (let step = 1; step < session.fields.length; step++) {
      const index = (session.active + step) % session.fields.length;
      if (session.fields[index].status === "empty") {
        session.active = index;
        break;
      }
    }
  }
}
export function scannerValue(session: Session): string {
  const field = session.fields[session.active];
  if (!field?.value?.trim()) throw Error("noValue");
  if (
    field.status === "mismatch" ||
    (session.template.verificationEnabled && field.status !== "verified")
  )
    throw Error("scannerUnverified");
  return field.value;
}
// Copy by exact name only. Template-specific comparison must be verified afresh.
export function applyScanner(scanner: Session, template: Template): Session {
  const result = startSession(template);
  for (const field of result.fields) {
    const source = scanner.fields.find((f) => f.name === field.name);
    if (
      source?.value !== null &&
      source?.value !== undefined &&
      source.status !== "mismatch"
    ) {
      field.value = source.value;
      field.status = "captured";
    }
  }
  const empty = result.fields.findIndex((f) => f.value === null);
  result.active = empty < 0 ? 0 : empty;
  result.mode =
    empty >= 0
      ? "capture"
      : template.verificationEnabled && result.fields.length
        ? "verify"
        : "ready";
  return result;
}
