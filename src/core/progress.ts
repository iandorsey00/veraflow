import type { Session } from "./model";

/** Presentation only: never grants verification or delivery success. */
export function sessionProgress(session: Session) {
  const filled = session.fields.filter((f) => f.value !== null).length;
  const matched = session.fields.filter((f) => f.status === "verified").length;
  const skipped = session.fields.filter((f) => f.status === "skipped").length;
  const pending = session.fields.filter((f) => f.status === "empty").length;
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
                session.template.verificationEnabled
              ? "nextCheck"
              : session.scanner
                ? "nextCopy"
                : pending
                  ? "nextPending"
                  : session.template.verificationEnabled
                    ? "nextCheck"
                    : "nextOutput";
  return { filled, matched, skipped, pending, checking, next } as const;
}
