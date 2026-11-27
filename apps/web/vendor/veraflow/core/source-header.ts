import { parse, type ValueNode } from "@humanwhocodes/momoa";

// Recognize the delimiter only outside strings and comments. The parser still
// validates the complete header, including all quoted and unquoted tokens.
const framing =
  /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\r\n\u2028\u2029]*|"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*'|(?:^|(?<=\n))---(?:\r?\n|$)/g;

export function sourceHeader(source: string) {
  const opening = /^--- veraflow 2\r?\n/.exec(source);
  if (!opening) return;
  const rest = source.slice(opening[0].length);
  for (const match of rest.matchAll(framing)) {
    if (!match[0].startsWith("---")) continue;
    const end = match.index + match[0].length;
    return {
      metadata: rest.slice(0, match.index),
      body: rest.slice(end),
      prefix: source.slice(0, opening[0].length + end),
    };
  }
}

type Fail = (detail: string, line?: number) => never;

export function parseSourceMetadata(text: string, fail: Fail): unknown {
  let root: ValueNode;
  try {
    root = parse(text, { mode: "json5" }).body;
  } catch (error) {
    if (error instanceof RangeError)
      return fail("The metadata header is nested too deeply.", 2);
    const offset =
      typeof error === "object" &&
      error !== null &&
      "offset" in error &&
      typeof error.offset === "number"
        ? error.offset
        : 0;
    return fail(
      "The metadata header contains invalid JSON5. Check quotes, commas, and brackets.",
      2 + (text.slice(0, offset).match(/\n/g)?.length ?? 0),
    );
  }

  function value(node: ValueNode, depth: number): unknown {
    const line = node.loc.start.line + 1;
    if (depth > 64) fail("The metadata header is nested too deeply.", line);
    switch (node.type) {
      case "Object": {
        const entries = new Map<string, unknown>();
        for (const { name, value: member } of node.members) {
          const key = name.type === "String" ? name.value : name.name;
          if (entries.has(key))
            fail(
              `Duplicate metadata key ${JSON.stringify(key)}.`,
              name.loc.start.line + 1,
            );
          entries.set(key, value(member, depth + 1));
        }
        return Object.fromEntries(entries);
      }
      case "Array":
        return node.elements.map((element) => value(element.value, depth + 1));
      case "Null":
        return null;
      case "Boolean":
      case "String":
        return node.value;
      case "Number":
        if (Number.isFinite(node.value)) return node.value;
        return fail("Metadata numbers must be finite.", line);
      case "NaN":
      case "Infinity":
        return fail("Metadata numbers must be finite.", line);
    }
  }

  return value(root, 1);
}
