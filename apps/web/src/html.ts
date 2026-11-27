export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function inertJson(value: unknown) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
}
