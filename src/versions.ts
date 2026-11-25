export function isReleaseVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  );
}

export function compareVersions(left: string, right: string) {
  const other = right.split(".");
  for (const [index, part] of left.split(".").entries()) {
    if (part.length !== other[index].length)
      return part.length - other[index].length;
    if (part !== other[index]) return part < other[index] ? -1 : 1;
  }
  return 0;
}
