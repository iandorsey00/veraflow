import type { Session } from "../../../src/core/model";
import { planRecordValues, recordValues } from "../../../src/core/source-record";
import { SourceSyntaxError } from "../../../src/core/source";
import type { Message } from "./strings";

export type RecordValues = ReadonlyMap<string, string | null>;

export function recordIssue(failure: unknown): {
  key: Message;
  argument?: string;
  detail?: string;
} {
  if (failure instanceof SourceSyntaxError)
    return {
      key: failure.line ? "sourceLine" : "sourceError",
      argument: failure.line?.toString(),
      detail: failure.detail,
    };
  const message = failure instanceof Error ? failure.message : "";
  const separator = message.indexOf(":");
  const key = separator === -1 ? message : message.slice(0, separator);
  switch (key) {
    case "recordInputLimit":
    case "recordInputSyntax":
    case "recordInputObject":
    case "recordInputName":
    case "recordInputDuplicate":
    case "recordInputNumber":
    case "recordInputNested":
    case "recordUnknownField":
    case "recordInvalidField":
    case "recordReadError":
    case "recordFileType":
      return { key, argument: separator === -1 ? undefined : message.slice(separator + 1) };
    default:
      return { key: "exportError" };
  }
}

export function reviewRecordMerge(session: Session, incoming: RecordValues) {
  const changes = planRecordValues(session, incoming);
  const replacements = new Map(
    changes.map(({ index, value }) => [session.fields[index].name, value]),
  );
  const current = recordValues(session);
  const rows = [...incoming.keys()].map((name) => ({
    name,
    current: current.get(name)!,
    incoming: replacements.has(name) ? replacements.get(name)! : current.get(name)!,
    changed: replacements.has(name),
  }));
  return { changes, rows };
}
