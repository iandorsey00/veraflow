import { parse, type ValueNode } from "@humanwhocodes/momoa";
import {
  normalizeText,
  validStoredValue,
  type Control,
} from "../vendor/veraflow/core/form";

export const collectionLimit = 1024 * 1024;
const kinds = [
  "text",
  "textarea",
  "email",
  "date",
  "number",
  "boolean",
  "radio",
  "dropdown",
] as const;
type Kind = (typeof kinds)[number];
type Choice = { id: string; label: string };
export type Question = {
  id: string;
  label: string;
  type: Kind;
  required: boolean;
  instructions?: string;
  multiline?: boolean;
  allowBlankLines?: boolean;
  options?: Choice[];
};
export type CollectionRequest = {
  format: "veraflow-collection-request";
  version: 1;
  requestId: string;
  questions: Question[];
};

function record(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw Error("invalidCollectionRequest");
  return value as Record<string, unknown>;
}

function checkKeys(node: ValueNode, depth = 1) {
  if (depth > 12) throw Error("invalidCollectionRequest");
  if (node.type === "Object") {
    const names = new Set<string>();
    for (const { name, value } of node.members) {
      if (name.type !== "String" || names.has(name.value))
        throw Error("invalidCollectionRequest");
      names.add(name.value);
      checkKeys(value, depth + 1);
    }
  } else if (node.type === "Array") {
    for (const { value } of node.elements) checkKeys(value, depth + 1);
  }
}

function textValue(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && !value.includes("\0");
}

export function readCollectionRequest(text: string): CollectionRequest {
  if (new TextEncoder().encode(text).length > collectionLimit)
    throw Error("invalidCollectionRequest");
  const input = text.replace(/^\uFEFF/, "");
  checkKeys(parse(input).body);
  const request = record(JSON.parse(input), [
    "format",
    "version",
    "requestId",
    "questions",
  ]);
  if (
    request.format !== "veraflow-collection-request" ||
    request.version !== 1 ||
    typeof request.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(request.requestId) ||
    !Array.isArray(request.questions) ||
    !request.questions.length ||
    request.questions.length > 1000
  )
    throw Error("invalidCollectionRequest");

  const ids = new Set<string>();
  for (const item of request.questions) {
    const question = record(item, [
      "id",
      "label",
      "type",
      "required",
      "instructions",
      "multiline",
      "allowBlankLines",
      "options",
    ]);
    const {
      id,
      label,
      type,
      required,
      instructions,
      multiline,
      allowBlankLines,
      options,
    } = question;
    const textKind = type === "text" || type === "textarea";
    if (
      !textValue(id) ||
      id.length > 1024 ||
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(id) ||
      ids.has(id) ||
      !textValue(label) ||
      !kinds.some((kind) => kind === type) ||
      typeof required !== "boolean" ||
      (instructions !== undefined && !textValue(instructions)) ||
      (multiline !== undefined &&
        (!textKind || typeof multiline !== "boolean")) ||
      (allowBlankLines !== undefined &&
        (!textKind ||
          typeof allowBlankLines !== "boolean" ||
          (allowBlankLines && multiline !== true)))
    )
      throw Error("invalidCollectionRequest");
    ids.add(id);

    const choice =
      type === "boolean" || type === "radio" || type === "dropdown";
    if (!choice) {
      if (options !== undefined) throw Error("invalidCollectionRequest");
      continue;
    }
    if (!Array.isArray(options) || !options.length || options.length > 100)
      throw Error("invalidCollectionRequest");
    const optionIds = new Set<string>();
    for (const item of options) {
      const option = record(item, ["id", "label"]);
      if (
        typeof option.id !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(option.id) ||
        optionIds.has(option.id) ||
        !textValue(option.label)
      )
        throw Error("invalidCollectionRequest");
      optionIds.add(option.id);
    }
    if (
      type === "boolean" &&
      !(optionIds.size === 2 && optionIds.has("true") && optionIds.has("false"))
    )
      throw Error("invalidCollectionRequest");
  }
  return request as CollectionRequest;
}

export function collectionAnswer(question: Question, value: string) {
  const control: Control = {
    kind: question.type,
    optional: !question.required,
    multiline: question.multiline,
    allowBlankLines: question.allowBlankLines,
    options:
      question.options &&
      new Map(question.options.map(({ id, label }) => [id, label])),
  };
  const answer = normalizeText(control, value);
  if (!answer.trim()) {
    if (question.required) throw Error("collectionRequired");
    return undefined;
  }
  if (answer.includes("\0") || !validStoredValue(control, answer))
    throw Error("collectionInvalidAnswer");
  return answer;
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
