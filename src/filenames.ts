export function timestampedFilename(filename: string, now = new Date()) {
  const dot = filename.lastIndexOf(".");
  const stamp = now.toISOString().replace("T", "_").replaceAll(":", "-");
  const suffix = `-${stamp}${filename.slice(dot)}`;
  const encoder = new TextEncoder();
  let remaining = 255 - encoder.encode(suffix).length;
  let stem = "";
  for (const character of filename.slice(0, dot)) {
    remaining -= encoder.encode(character).length;
    if (remaining < 0) break;
    stem += character;
  }
  return stem + suffix;
}
