import {
  normalizeCollectionAnswer,
  type CollectionRequest,
  type CollectionQuestion,
} from "../../../src/core/collection";
import { recordInputLimit } from "../../../src/core/source-record";

export { readCollectionRequest } from "../../../src/core/collection";
export type {
  CollectionRequest,
  CollectionQuestion as Question,
} from "../../../src/core/collection";
export const collectionLimit = recordInputLimit;

export function collectionAnswer(question: CollectionQuestion, value: string) {
  // A blank browser control represents an omitted optional answer.
  if (!question.required && !value.trim()) return undefined;
  try {
    return normalizeCollectionAnswer(question, value) ?? undefined;
  } catch (reason) {
    if (reason instanceof Error && reason.message === "collectionRequired")
      throw reason;
    throw Error("collectionInvalidAnswer");
  }
}

function responseId() {
  // getRandomValues also works when a browser does not expose randomUUID to file URLs.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function collectionResponseWriter(request: CollectionRequest) {
  const allowed = new Set(request.questions.map(({ id }) => id));
  let previousAnswers: string | undefined;
  let previousResponse: string | undefined;
  return (answers: ReadonlyMap<string, string>) => {
    if ([...answers.keys()].some((id) => !allowed.has(id)))
      throw Error("collectionUnexpected");
    const fields = new Map<string, string>();
    for (const question of request.questions) {
      const value = collectionAnswer(question, answers.get(question.id) ?? "");
      if (value !== undefined) fields.set(question.id, value);
    }
    const values = Object.fromEntries(fields);
    const snapshot = JSON.stringify(values);
    if (previousResponse !== undefined && snapshot === previousAnswers)
      return previousResponse;

    const response =
      JSON.stringify(
        {
          format: "veraflow-collection-response",
          version: 1,
          requestId: request.requestId,
          responseId: responseId(),
          fields: values,
        },
        null,
        2,
      ) + "\n";
    if (new TextEncoder().encode(response).length > collectionLimit)
      throw Error("collectionTooLarge");
    previousAnswers = snapshot;
    previousResponse = response;
    return response;
  };
}
