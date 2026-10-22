import { parseCSV, suggestHeader, csvTable } from "./core/csv";
import { parseFields } from "./core/template";
import {
  exportWorkspace,
  importWorkspace,
  fieldNames,
  veraId,
  type Workspace,
  type DataTable,
  type DataRow,
  type ExternalId,
} from "./core/workspace";
import { platform } from "./platform";
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
type Input = {
  key: string;
  label: string;
  value?: string;
  lines?: boolean;
  check?: boolean;
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
  d.innerHTML = `<form><h2 id="workspace-dialog-title">${esc(title)}</h2>${fields.map((f) => `<label for="dialog-${f.key}">${esc(f.label)}</label>${f.check ? `<input id="dialog-${f.key}" name="${f.key}" type="checkbox" ${f.value === "true" ? "checked" : ""}>` : f.lines ? `<textarea id="dialog-${f.key}" name="${f.key}" rows="5">${esc(f.value ?? "")}</textarea>` : `<input id="dialog-${f.key}" name="${f.key}" value="${esc(f.value ?? "")}" maxlength="1000">`}`).join("")}<p id="workspace-dialog-error" role="alert"></p><div class="actions"><button type="button" id="dialog-cancel">${esc(cancel)}</button><button type="submit" class="primary">${esc(action)}</button></div></form>`;
  const prior = document.activeElement as HTMLElement | null;
  document.body.append(d);
  d.showModal();
  d.querySelector<HTMLElement>("input,textarea")?.focus();
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
export function parseRefs(text: string): ExternalId[] {
  return text
    .split(/\r?\n/)
    .filter((s) => s.trim())
    .map((s) => {
      const i = s.indexOf("=");
      if (
        i < 1 ||
        !s.slice(0, i).trim() ||
        s.slice(0, i).trim().length > 250 ||
        s.slice(i + 1).trim().length > 1000
      )
        throw Error("invalidReferences");
      return { label: s.slice(0, i).trim(), value: s.slice(i + 1).trim() };
    });
}
export const refsText = (refs: ExternalId[]) =>
  refs.map((r) => `${r.label}=${r.value}`).join("\n");
export function workspaceUI(deps: {
  get: () => Workspace;
  save: (w: Workspace) => Promise<void>;
  lang: () => boolean;
  render: () => void;
  run: (f: () => Promise<void> | void) => Promise<void>;
  open: (t: DataTable, r: DataRow) => Promise<void>;
  confirm: (detail: string, action: string) => Promise<boolean>;
}) {
  let folder = "",
    tableId = "";
  const l = (en: string, zh: string) => (deps.lang() ? zh : en);
  const btn = (action: string, label: string, extra = "") =>
    `<button data-workspace="${action}" ${extra}>${esc(label)}</button>`;
  const active = () => deps.get().tables.find((t) => t.id === tableId);
  async function save(w: Workspace) {
    await deps.save(w);
    deps.render();
  }
  async function tableForm(t?: DataTable) {
    const w = structuredClone(deps.get());
    const input = await formDialog(
      l("Table settings", "表格设置"),
      [
        { key: "name", label: l("Table name", "表格名称"), value: t?.name },
        {
          key: "fields",
          label: l(
            "Field names — one per line; leave blank to infer from template",
            "字段名（每行一个，留空则从模板推导）",
          ),
          value: t?.fields.join("\n"),
          lines: true,
        },
        {
          key: "rowTitles",
          label: l("Show row titles", "显示行标题"),
          value: String(t?.rowTitles ?? true),
          check: true,
        },
        {
          key: "output",
          label: l(
            "Reusable text or template (optional) — use {{field_name}}",
            "常用文本或模板（可选），使用 {{字段名}}",
          ),
          value: t?.output,
          lines: true,
        },
        {
          key: "refs",
          label: l(
            "External IDs (optional) — one Label=Value per line",
            "外部编号（可选），每行 标签=值",
          ),
          value: t ? refsText(t.externalIds) : "",
          lines: true,
        },
      ],
      l("Save table", "保存表格"),
      l("Keep working", "继续编辑"),
      (input) => {
        try {
          if (!input.name.trim())
            return l("Enter a table name.", "请输入表格名称。");
          if (input.fields.trim()) fieldNames(input.fields);
          else {
            const inferred = parseFields(input.output, "braces");
            if (inferred.length) fieldNames(inferred.join("\n"));
          }
          parseRefs(input.refs);
          return null;
        } catch {
          return l(
            "Use unique field names, one per line. External IDs use Label=Value.",
            "字段名不能重复，每行一个。外部编号使用 标签=值。",
          );
        }
      },
    );
    if (!input) return;
    if (!input.name.trim()) throw Error("nameRequired");
    const fields = input.fields.trim()
      ? fieldNames(input.fields)
      : parseFields(input.output, "braces");
    if (
      t &&
      t.fields.some(
        (n) =>
          !fields.includes(n) && t.rows.some((r) => r.values[n] !== undefined),
      ) &&
      !(await deps.confirm(
        l(
          "Removing fields also removes their saved values from every row.",
          "删除字段也会删除所有行中相应的值。",
        ),
        l("Remove fields", "删除字段"),
      ))
    )
      return;
    const next: DataTable = {
      id: t?.id ?? veraId(),
      name: input.name.trim(),
      folderId: t?.folderId ?? folder,
      fields,
      rowTitles: input.rowTitles === "true",
      output: input.output,
      externalIds: parseRefs(input.refs),
      rows: (t?.rows ?? []).map((r) => ({
        ...r,
        values: Object.fromEntries(
          Object.entries(r.values).filter(([n]) => fields.includes(n)),
        ),
      })),
    };
    w.tables = t
      ? w.tables.map((x) => (x.id === t.id ? next : x))
      : [...w.tables, next];
    tableId = next.id;
    await save(w);
  }
  async function newRow() {
    const t = active();
    if (!t) return;
    const r: DataRow = { id: veraId(), title: "", externalIds: [], values: {} };
    if (t.rowTitles) {
      const input = await formDialog(
        l("New row", "新建行"),
        [{ key: "title", label: l("Row title (optional)", "行标题（可选）") }],
        l("Create row", "创建行"),
        l("Keep working", "继续编辑"),
      );
      if (!input) return;
      r.title = input.title;
    }
    const w = structuredClone(deps.get());
    w.tables.find((x) => x.id === t.id)!.rows.push(r);
    await save(w);
    if (t.fields.length) await deps.open(t, r);
  }
  return {
    view() {
      const w = deps.get(),
        t = active();
      return `<main class="workspace"><aside><h1>${l("Workspace", "工作区")}</h1><p class="hint">${l("Table rows are saved locally. Free Scanner is temporary.", "表格行保存在本机；自由扫描器仅临时保留数据。")}</p><label for="workspace-folder">${l("Folder", "文件夹")}</label><select id="workspace-folder"><option value="">${l("Unfiled", "未归档")}</option>${w.folders.map((f) => `<option value="${esc(f.id)}" ${f.id === folder ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select><div class="toolbar">${btn("folder", l("New folder", "新建文件夹"))}${folder ? btn("rename-folder", l("Rename folder", "重命名文件夹")) + btn("delete-folder", l("Delete folder", "删除文件夹")) : ""}</div><h2>${l("Tables", "表格")}</h2>${w.tables
        .filter((t) => t.folderId === folder)
        .map((t) =>
          btn(
            "select",
            t.name,
            `data-id="${esc(t.id)}" ${t.id === tableId ? 'aria-current="page"' : ""}`,
          ),
        )
        .join(
          "",
        )}${btn("new-table", l("New table", "新建表格"))}<div class="workspace-exchange">${btn("import-csv", l("Import CSV", "导入 CSV"))}${btn("import", l("Import database JSON", "导入数据库 JSON"))}${btn("export", l("Export database JSON", "导出数据库 JSON"))}</div></aside><section class="workspace-content">${t ? `<h1>${esc(t.name)}</h1><p class="vera-id">${esc(t.id)}</p>${t.externalIds.map((r) => `<p>${esc(r.label)}: ${esc(r.value)}</p>`).join("")}<div class="toolbar">${btn("new-row", l("New row", "新建行"))}${btn("edit", l("Table settings", "表格设置"))}${btn("move", l("Move to folder", "移动到文件夹"))}${btn("export-table", l("Export table JSON", "导出表格 JSON"))}${btn("delete-table", l("Delete table", "删除表格"))}</div>${t.output && !t.fields.length ? `<pre class="output">${esc(t.output)}</pre>${btn("copy-text", l("Copy reusable text", "复制常用文本"))}` : ""}<div class="data-table-scroll"><table class="data-table"><thead><tr>${t.rowTitles ? `<th>${l("Title", "标题")}</th>` : ""}<th>${l("VeraFlow ID", "VeraFlow 编号")}</th>${t.fields.map((n) => `<th>${esc(n)}</th>`).join("")}<th>${l("Actions", "操作")}</th></tr></thead><tbody>${t.rows.map((r) => `<tr>${t.rowTitles ? `<td>${esc(r.title)}</td>` : ""}<td class="vera-id">${esc(r.id)}</td>${t.fields.map((n) => `<td>${esc(Object.hasOwn(r.values, n) ? r.values[n] : "—")}</td>`).join("")}<td>${btn("open", l("Open Scanner", "打开扫描器"), `data-id="${esc(r.id)}" ${!t.fields.length ? "disabled" : ""}`)}${btn("row-details", l("Row details", "行详情"), `data-id="${esc(r.id)}"`)}${btn("delete-row", l("Delete row", "删除行"), `data-id="${esc(r.id)}"`)}</td></tr>`).join("")}</tbody></table></div>${!t.rows.length ? `<p>${l("No rows yet. Add a row or save Free Scanner as a row.", "暂无数据行。可添加行，或将自由扫描器保存为行。")}</p>` : ""}` : `<h1>${l("Your tables", "我的表格")}</h1><p>${l("Create a table for trips, shipments, contacts, or any repeatable set of fields. Every row opens in Scanner.", "为旅行、货运、联系人等创建表格。每一行都可在扫描器中打开。")}</p>${btn("new-table", l("Create table", "创建表格"))}`}</section></main>`;
    },
    bind(root: HTMLElement) {
      root
        .querySelector("#workspace-folder")
        ?.addEventListener("change", (e) => {
          folder = (e.target as HTMLSelectElement).value;
          tableId = "";
          deps.render();
        });
      root.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach(
        (b) =>
          (b.onclick = () =>
            void deps.run(async () => {
              const action = b.dataset.workspace!,
                t = active(),
                w = structuredClone(deps.get());
              if (action === "select") {
                tableId = b.dataset.id!;
                deps.render();
              } else if (action === "new-table") await tableForm();
              else if (action === "edit" && t) await tableForm(t);
              else if (action === "folder" || action === "rename-folder") {
                const old = w.folders.find((f) => f.id === folder);
                const input = await formDialog(
                  l("Folder", "文件夹"),
                  [
                    {
                      key: "name",
                      label: l("Folder name", "文件夹名称"),
                      value: action === "rename-folder" ? old?.name : "",
                    },
                  ],
                  l("Save folder", "保存文件夹"),
                );
                if (!input) return;
                if (!input.name.trim()) throw Error("nameRequired");
                if (action === "rename-folder") old!.name = input.name.trim();
                else {
                  folder = veraId();
                  w.folders.push({ id: folder, name: input.name.trim() });
                }
                await save(w);
              } else if (action === "delete-folder") {
                if (
                  !(await deps.confirm(
                    l(
                      "Delete this folder? Its tables will become unfiled.",
                      "删除此文件夹？其中的表格将移至未归档。",
                    ),
                    l("Delete folder", "删除文件夹"),
                  ))
                )
                  return;
                w.folders = w.folders.filter((f) => f.id !== folder);
                w.tables.forEach((t) => {
                  if (t.folderId === folder) t.folderId = "";
                });
                folder = "";
                await save(w);
              } else if (action === "new-row") await newRow();
              else if (action === "export" || action === "export-table") {
                if (
                  !(await deps.confirm(
                    l(
                      "Export includes saved row values. Review the file before sharing.",
                      "导出文件包含已保存的行值。分享前请检查内容。",
                    ),
                    l("Export JSON", "导出 JSON"),
                  ))
                )
                  return;
                await platform.exportTemplates(
                  exportWorkspace(
                    action === "export"
                      ? w
                      : {
                          folders: w.folders.filter(
                            (f) => f.id === t?.folderId,
                          ),
                          tables: t ? [t] : [],
                        },
                  ),
                  action === "export"
                    ? "veraflow-database.json"
                    : "veraflow-table.json",
                );
              } else if (action === "import-csv") {
                const source = await platform.importTemplates("csv");
                if (source === null) return;
                const rows = parseCSV(source);
                let header = suggestHeader(rows);
                const d = document.createElement("dialog");
                d.className = "csv-preview";
                d.setAttribute("aria-label", l("Import CSV", "导入 CSV"));
                d.innerHTML = `<form><h2>${l("Import CSV", "导入 CSV")}</h2><label for="csv-name">${l("Table name", "表格名称")}</label><input id="csv-name" maxlength="1000" required><label class="check"><input id="csv-header" type="checkbox" ${header ? "checked" : ""}>${l("Use first row as headers", "首行作为字段名")}</label><p class="hint">${l("Header detection is a suggestion. Review the first five rows. Blank or duplicate headers receive unique names. Values are saved locally as text.", "表头识别仅为建议，请检查前五行。空白或重复表头将生成唯一名称，值作为文本保存在本机。")}</p><div id="csv-sample" class="data-table-scroll"></div><div class="actions"><button type="button" id="csv-cancel">${l("Keep working", "继续编辑")}</button><button type="submit" class="primary">${l("Import table", "导入表格")}</button></div></form>`;
                const preview = () => {
                  header = (d.querySelector("#csv-header") as HTMLInputElement)
                    .checked;
                  try {
                    const sample = csvTable(rows, header, "Preview");
                    (
                      d.querySelector(
                        'button[type="submit"]',
                      ) as HTMLButtonElement
                    ).disabled = false;
                    d.querySelector("#csv-sample")!.innerHTML =
                      `<p>${sample.rows.length} ${l("rows", "行")}</p><table class="data-table"><thead><tr>${sample.fields.map((n) => `<th>${esc(n)}</th>`).join("")}</tr></thead><tbody>${sample.rows
                        .slice(0, 5)
                        .map(
                          (r) =>
                            `<tr>${sample.fields.map((n) => `<td>${esc(r.values[n])}</td>`).join("")}</tr>`,
                        )
                        .join("")}</tbody></table>`;
                  } catch {
                    d.querySelector("#csv-sample")!.innerHTML =
                      `<p role="alert">${l("This import exceeds the local table limits. Use a smaller CSV.", "导入超过本地表格限制，请使用较小的 CSV 文件。")}</p>`;
                    (
                      d.querySelector(
                        'button[type="submit"]',
                      ) as HTMLButtonElement
                    ).disabled = true;
                  }
                };
                document.body.append(d);
                d.showModal();
                preview();
                d.querySelector("#csv-header")!.addEventListener(
                  "change",
                  preview,
                );
                const name = await new Promise<string | null>((resolve) => {
                  let done = false;
                  const close = (name: string | null) => {
                    if (done) return;
                    done = true;
                    d.close();
                    d.remove();
                    resolve(name);
                  };
                  d.querySelector("#csv-cancel")!.addEventListener(
                    "click",
                    () => close(null),
                  );
                  d.addEventListener("cancel", (e) => {
                    e.preventDefault();
                    close(null);
                  });
                  d.querySelector("form")!.onsubmit = (e) => {
                    e.preventDefault();
                    const name = (
                      d.querySelector("#csv-name") as HTMLInputElement
                    ).value.trim();
                    if (name) close(name);
                  };
                });
                if (name === null) return;
                const table = csvTable(rows, header, name, folder);
                w.tables.push(table);
                tableId = table.id;
                await save(w);
              } else if (action === "import") {
                const json = await platform.importTemplates();
                if (json === null) return;
                const merged = importWorkspace(json, w);
                if (
                  !(await deps.confirm(
                    l(
                      "Add the imported folders, tables, and saved values? Existing rows will not be overwritten.",
                      "添加导入的文件夹、表格及已保存的值？现有行不会被覆盖。",
                    ),
                    l("Import JSON", "导入 JSON"),
                  ))
                )
                  return;
                await save(merged);
              } else if (action === "delete-table" && t) {
                if (
                  !(await deps.confirm(
                    l(
                      "Delete this table and all saved row values?",
                      "删除此表格及所有已保存的行值？",
                    ),
                    l("Delete table", "删除表格"),
                  ))
                )
                  return;
                w.tables = w.tables.filter((x) => x.id !== t.id);
                tableId = "";
                await save(w);
              } else if (action === "move" && t) {
                const input = await formDialog(
                  l("Move table", "移动表格"),
                  [
                    {
                      key: "folder",
                      label: l(
                        "Folder name (blank for Unfiled)",
                        "文件夹名称（留空为未归档）",
                      ),
                      value: w.folders.find((f) => f.id === t.folderId)?.name,
                    },
                  ],
                  l("Move table", "移动表格"),
                );
                if (!input) return;
                const found = w.folders.find(
                  (f) => f.name === input.folder.trim(),
                );
                if (input.folder.trim() && !found)
                  throw Error("folderNotFound");
                w.tables.find((x) => x.id === t.id)!.folderId = found?.id ?? "";
                folder = found?.id ?? "";
                await save(w);
              } else if (action === "copy-text" && t)
                await platform.copy(t.output);
              else if (t) {
                const r = t.rows.find((r) => r.id === b.dataset.id);
                if (!r) return;
                if (action === "open") await deps.open(t, r);
                else if (action === "delete-row") {
                  if (
                    !(await deps.confirm(
                      l(
                        "Delete this row and its saved values?",
                        "删除此行及其已保存的值？",
                      ),
                      l("Delete row", "删除行"),
                    ))
                  )
                    return;
                  w.tables.find((x) => x.id === t.id)!.rows = t.rows.filter(
                    (x) => x.id !== r.id,
                  );
                  await save(w);
                } else if (action === "row-details") {
                  const input = await formDialog(
                    `${l("Row details", "行详情")} · ${r.id}`,
                    [
                      {
                        key: "title",
                        label: l("Title (optional)", "标题（可选）"),
                        value: r.title,
                      },
                      {
                        key: "refs",
                        label: l(
                          "External IDs — one Label=Value per line",
                          "外部编号，每行 标签=值",
                        ),
                        value: refsText(r.externalIds),
                        lines: true,
                      },
                    ],
                    l("Save details", "保存详情"),
                  );
                  if (!input) return;
                  const dest = w.tables
                    .find((x) => x.id === t.id)!
                    .rows.find((x) => x.id === r.id)!;
                  dest.title = input.title;
                  dest.externalIds = parseRefs(input.refs);
                  await save(w);
                }
              }
            })),
      );
    },
    select(id: string) {
      tableId = id;
      folder = deps.get().tables.find((t) => t.id === id)?.folderId ?? "";
    },
  };
}
