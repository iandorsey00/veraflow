import { type Session } from "../../../src/core/model";
import { recordValues } from "../../../src/core/source-record";

export function responseJson(session: Session, included: ReadonlySet<string>) {
  const entries = [...recordValues(session)].filter(([name]) =>
    included.has(name),
  );
  return JSON.stringify(Object.fromEntries(entries), null, 2) + "\n";
}
