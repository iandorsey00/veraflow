import { platform } from "./platform";
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export type Input = {
  key: string;
  label: string;
  value?: string;
  lines?: boolean;
  check?: boolean;
  options?: { value: string; label: string }[];
  searchOptions?: {
    label: string;
    previous: string;
    next: string;
    match: (value: string, query: string) => boolean;
    details: (value: string) => [string, string][];
  };
};
export async function formDialog(
  title: string,
  fields: Input[],
  action: string,
  cancel = document.documentElement.lang === "zh-CN"
    ? "继续编辑"
    : "Keep working",
  validate?: (values: Record<string, string>) => string | null,
): Promise<Record<string, string> | null> {
  const d = document.createElement("dialog");
  d.setAttribute("aria-labelledby", "workspace-dialog-title");
  d.innerHTML = `<form><h2 id="workspace-dialog-title">${esc(title)}</h2>${fields
    .map(
      (f) =>
        `${f.searchOptions ? `<label for="dialog-${f.key}-search">${esc(f.searchOptions.label)}</label><input type="search" id="dialog-${f.key}-search" autocomplete="off">` : ""}<label for="dialog-${f.key}">${esc(f.label)}</label>${
          f.options
            ? `<select id="dialog-${f.key}" name="${f.key}">${f.options
                .slice(0, f.searchOptions ? 75 : undefined)
                .map(
                  (o) =>
                    `<option value="${esc(o.value)}" ${o.value === f.value ? "selected" : ""}>${esc(o.label)}</option>`,
                )
                .join(
                  "",
                )}</select>${f.searchOptions ? `<div class="toolbar"><button type="button" id="dialog-${f.key}-prev">${esc(f.searchOptions.previous)}</button><button type="button" id="dialog-${f.key}-next">${esc(f.searchOptions.next)}</button><span role="status" id="dialog-${f.key}-count"></span></div><dl class="csv-row-preview" id="dialog-${f.key}-preview"></dl>` : ""}`
            : f.check
              ? `<input id="dialog-${f.key}" name="${f.key}" type="checkbox" ${f.value === "true" ? "checked" : ""}>`
              : f.lines
                ? `<textarea id="dialog-${f.key}" name="${f.key}" rows="5">${esc(f.value ?? "")}</textarea>`
                : `<input id="dialog-${f.key}" name="${f.key}" value="${esc(f.value ?? "")}" maxlength="1000">`
        }`,
    )
    .join(
      "",
    )}<p id="workspace-dialog-error" role="alert"></p><div class="actions"><button type="button" id="dialog-cancel">${esc(cancel)}</button><button type="submit" class="primary">${esc(action)}</button></div></form>`;
  for (const field of fields) {
    const search = field.searchOptions;
    if (!search || !field.options) continue;
    const input = d.querySelector<HTMLInputElement>(
      `#dialog-${field.key}-search`,
    )!;
    const select = d.querySelector<HTMLSelectElement>(`#dialog-${field.key}`)!;
    select.required = true;
    const preview = d.querySelector<HTMLDListElement>(
      `#dialog-${field.key}-preview`,
    )!;
    const count = d.querySelector<HTMLElement>(`#dialog-${field.key}-count`)!;
    const previous = d.querySelector<HTMLButtonElement>(
      `#dialog-${field.key}-prev`,
    )!;
    const next = d.querySelector<HTMLButtonElement>(
      `#dialog-${field.key}-next`,
    )!;
    const submit = d.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const pageSize = 75;
    let page = 0;
    const showPreview = () => {
      const rows = select.value ? search.details(select.value) : [];
      preview.innerHTML = rows
        .map(
          ([header, value]) =>
            `<div><dt>${esc(header)}</dt><dd>${esc(value.slice(0, 500))}</dd></div>`,
        )
        .join("");
      preview.hidden = !rows.length;
    };
    const refresh = () => {
      const query = input.value.trim().toLocaleLowerCase();
      const results = query
        ? field.options!.filter(({ value }) => search.match(value, query))
        : field.options!;
      const start = page * pageSize;
      select.replaceChildren(
        ...results
          .slice(start, start + pageSize)
          .map(({ label, value }) => new Option(label, value)),
      );
      submit.disabled = !results.length;
      previous.disabled = page === 0;
      next.disabled = start + pageSize >= results.length;
      count.textContent = results.length
        ? `${start + 1}–${Math.min(start + pageSize, results.length)} / ${results.length}`
        : "0";
      showPreview();
    };
    input.oninput = () => {
      page = 0;
      refresh();
    };
    previous.onclick = () => {
      page--;
      refresh();
    };
    next.onclick = () => {
      page++;
      refresh();
    };
    select.onchange = showPreview;
    refresh();
  }
  const prior = document.activeElement as HTMLElement | null;
  await platform.active(true);
  document.body.append(d);
  d.showModal();
  d.querySelector<HTMLElement>("input,textarea,select")?.focus();
  return new Promise((resolve) => {
    let done = false;
    const close = (v: Record<string, string> | null) => {
      if (done) return;
      done = true;
      d.close();
      d.remove();
      prior?.focus();
      resolve(v);
    };
    d.querySelector("#dialog-cancel")!.addEventListener("click", () =>
      close(null),
    );
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(null);
    });
    d.querySelector("form")!.onsubmit = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(
        fields.map((f) => [
          f.key,
          f.check
            ? String(
                (d.querySelector(`[name="${f.key}"]`) as HTMLInputElement)
                  .checked,
              )
            : (d.querySelector(`[name="${f.key}"]`) as HTMLInputElement).value,
        ]),
      );
      const error = validate?.(values);
      if (error) {
        d.querySelector("#workspace-dialog-error")!.textContent = error;
        return;
      }
      close(values);
    };
  });
}
