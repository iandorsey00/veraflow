import { parse, type ValueNode } from "@humanwhocodes/momoa";

// Keep duplicate keys visible until validation. JSON.parse alone drops them.
export function readExchangeJSON(
  text: string,
  limit: number,
  error: string,
  maxDepth = 12,
) {
  if (new TextEncoder().encode(text).length > limit) throw Error(error);
  function check(node: ValueNode, depth: number) {
    if (depth > maxDepth) throw Error(error);
    if (node.type === "Object") {
      const keys = new Set<string>();
      for (const { name, value } of node.members) {
        if (name.type !== "String" || keys.has(name.value)) throw Error(error);
        keys.add(name.value);
        check(value, depth + 1);
      }
    } else if (node.type === "Array") {
      for (const element of node.elements) check(element.value, depth + 1);
    } else if (node.type === "Number" && !Number.isFinite(node.value)) {
      throw Error(error);
    }
  }
  try {
    const input = text.replace(/^\uFEFF/, "");
    check(parse(input).body, 1);
    return JSON.parse(input) as unknown;
  } catch {
    throw Error(error);
  }
}

export function exchangeObject(value: unknown, error: string, keys?: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (keys && Object.keys(value).some((key) => !keys.includes(key)))
  )
    throw Error(error);
  return value as Record<string, unknown>;
}
