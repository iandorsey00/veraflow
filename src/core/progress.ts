import { fieldVisible, verificationRequired } from "./session";
import type { Session } from "./model";

/** Presentation only: never grants verification or delivery success. */
export function sessionProgress(session: Session) {
  const fields = session.fields.filter((f) => fieldVisible(session, f.name));
  const filled = fields.filter((f) => f.value !== null).length;
  const matched = fields.filter((f) => f.status === "verified").length;
  const skipped = fields.filter((f) => f.status === "skipped").length;
  const pending = fields.filter(
    (f) => f.status === "empty" && !session.controls?.get(f.name)?.optional,
  ).length;
  const checking = session.mode === "verify";
  const field = session.fields[session.active];
  const next = checking
    ? "nextCompare"
    : session.mode === "delivery"
      ? "nextEmail"
      : session.mode === "ready"
        ? "nextOutput"
        : field?.status === "mismatch"
          ? "nextMismatch"
          : field?.value === null
            ? "nextCapture"
            : session.scanner &&
                field?.status !== "verified" &&
                verificationRequired(session)
              ? "nextCheck"
              : session.scanner
                ? "nextCopy"
                : pending
                  ? "nextPending"
                  : verificationRequired(session)
                    ? "nextCheck"
                    : "nextOutput";
  return { filled, matched, skipped, pending, checking, next } as const;
}
