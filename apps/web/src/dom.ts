export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, handler: () => void) {
  const node = element("button", label);
  node.type = "button";
  node.addEventListener("click", handler);
  return node;
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = element("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
