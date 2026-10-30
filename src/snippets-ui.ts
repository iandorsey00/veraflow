import { platform, desktop } from "./platform";
import {
  exportSnippets,
  importSnippets,
  validateWorkspace,
  veraId,
  type Workspace,
  type Snippet,
} from "./core/workspace";
import type { Input } from "./workspace-ui";
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function snippetsUI(deps: {
  get: () => Workspace;
  scope: () => string;
  lang: () => boolean;
  save: (w: Workspace) => Promise<void>;
  form: (
    title: string,
    fields: Input[],
    action: string,
    cancel?: string,
    validate?: (values: Record<string, string>) => string | null,
  ) => Promise<Record<string, string> | null>;
  confirm: (detail: string, action: string) => Promise<boolean>;
  run: (work: () => Promise<void> | void) => Promise<void>;
  copied: () => void;
  pasted: () => void;
}) {
  const l = (en: string, zh: string) => (deps.lang() ? zh : en);
  let selectedId = "";
  const items = () =>
    (deps.get().snippets ?? []).filter((s) => s.tableId === deps.scope());
  const btn = (action: string, label: string, id = "", disabled = false) =>
    `<button id="snippet-${action}${id ? "-" + id : ""}" data-snippet-action="${action}" data-id="${esc(id)}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
  const destinations = () => [
    { value: "", label: l("Unfiled", "未归档") },
    ...deps.get().tables.map((t) => ({
      value: t.id,
      label: `${deps.get().folders.find((f) => f.id === t.folderId)?.name ?? l("Unfiled", "未归档")} / ${t.name}`,
    })),
  ];
  async function edit(snippet?: Snippet, move = false) {
    const input = await deps.form(
      move
        ? l("Move snippet", "移动片段")
        : snippet
          ? l("Edit snippet", "编辑片段")
          : l("New snippet", "新建片段"),
      [
        ...(move
          ? []
          : [
              {
                key: "title",
                label: l("Snippet title", "片段标题"),
                value: snippet?.title,
              },
              {
                key: "content",
                label: l(
                  "Snippet text — literal text, no fields",
                  "片段文本（原文，不解析字段）",
                ),
                value: snippet?.content,
                lines: true,
              },
            ]),
        {
          key: "tableId",
          label: l("Store in", "存放位置"),
          value: snippet?.tableId ?? deps.scope(),
          options: destinations(),
        },
      ],
      move ? l("Move snippet", "移动片段") : l("Save snippet", "保存片段"),
      l("Keep working", "继续编辑"),
      (values) => {
        try {
          const next = {
            id: snippet?.id ?? veraId(),
            title: move ? snippet!.title : values.title.trim(),
            content: move ? snippet!.content : values.content,
            tableId: values.tableId,
          };
          validateWorkspace({
            ...deps.get(),
            snippets: [
              ...(deps.get().snippets ?? []).filter((s) => s.id !== next.id),
              next,
            ],
          });
          return null;
        } catch {
          return l(
            "Enter a title (up to 250 characters), nonempty text (up to 1 MB), and a valid destination.",
            "请输入标题（最多 250 字符）、非空文本（最多 1 MB）并选择有效位置。",
          );
        }
      },
    );
    if (!input) return;
    const next: Snippet = {
      id: snippet?.id ?? veraId(),
      title: move ? snippet!.title : input.title.trim(),
      content: move ? snippet!.content : input.content,
      tableId: input.tableId,
    };
    await deps.save({
      ...deps.get(),
      snippets: [
        ...(deps.get().snippets ?? []).filter((s) => s.id !== next.id),
        next,
      ],
    });
  }
  return {
    hasSnippets: () => items().length > 0,
    view: () =>
      `<section class="snippets" aria-labelledby="snippets-heading"><h2 id="snippets-heading">${l("Snippets", "文本片段")}</h2><p class="hint">${l("Select a snippet, then Ctrl/Cmd+V or Ctrl/Cmd+C transfers it to the clipboard. You can also click Transfer to clipboard. Text boxes keep normal paste.", "选择片段后，按 Ctrl/Cmd+V 或 Ctrl/Cmd+C 可传至剪贴板，也可点击“传至剪贴板”。文本框保留正常粘贴行为。")}</p><div class="toolbar">${btn("new", l("New snippet", "新建片段"))}${btn("import", l("Import snippets JSON", "导入片段 JSON"))}${btn("export", l("Export snippets JSON", "导出片段 JSON"), "", !items().length)}</div><div class="snippet-list">${
        items()
          .map(
            (s) =>
              `<article id="snippet-card-${esc(s.id)}" class="snippet-card ${selectedId === s.id ? "selected" : ""}" data-snippet="${esc(s.id)}" tabindex="0" aria-current="${selectedId === s.id}" aria-labelledby="snippet-title-${esc(s.id)}"><h3 id="snippet-title-${esc(s.id)}">${esc(s.title)}</h3><p class="snippet-preview">${esc(s.content.slice(0, 180))}${s.content.length > 180 ? "…" : ""}</p><details><summary>${l("View full text", "查看完整文本")}</summary><pre>${esc(s.content)}</pre></details><div class="toolbar">${btn("copy", l("Transfer to clipboard", "传至剪贴板"), s.id)}${btn("paste", l("Paste to last app", "粘贴到上个应用"), s.id, !desktop)}${btn("edit", l("Edit snippet", "编辑片段"), s.id)}${btn("move", l("Move snippet", "移动片段"), s.id)}${btn("delete", l("Delete snippet", "删除片段"), s.id)}</div></article>`,
          )
          .join("") ||
        `<p class="muted">${l("No snippets here yet. Add reusable text with a title.", "此处暂无片段，可添加带标题的常用文本。")}</p>`
      }</div></section>`,
    bind(root: HTMLElement) {
      root.querySelectorAll<HTMLElement>("[data-snippet]").forEach((card) => {
        const select = () => {
          selectedId = card.dataset.snippet!;
          root.querySelectorAll<HTMLElement>("[data-snippet]").forEach((el) => {
            const selected = el.dataset.snippet === selectedId;
            el.classList.toggle("selected", selected);
            el.setAttribute("aria-current", String(selected));
          });
        };
        card.addEventListener("focusin", select);
        card.onclick = (event) => {
          if (
            (event.target as HTMLElement).closest("button,summary,a") ||
            window.getSelection()?.toString()
          )
            return;
          card.focus();
        };
        card.onkeydown = (event) => {
          const key = event.key.toLowerCase();
          if (
            !(event.ctrlKey || event.metaKey) ||
            event.altKey ||
            event.shiftKey ||
            event.repeat ||
            event.isComposing ||
            !["c", "v"].includes(key) ||
            (event.target as HTMLElement).closest(
              "input,textarea,select,[contenteditable]",
            ) ||
            (key === "c" && window.getSelection()?.toString())
          )
            return;
          const snippet = items().find((s) => s.id === card.dataset.snippet);
          if (!snippet) return;
          event.preventDefault();
          event.stopPropagation();
          void deps.run(async () => {
            await platform.copy(snippet.content);
            deps.copied();
          });
        };
      });
      root
        .querySelectorAll<HTMLButtonElement>("[data-snippet-action]")
        .forEach((button) => {
          button.onclick = () =>
            void deps.run(async () => {
              const action = button.dataset.snippetAction;
              const snippet = (deps.get().snippets ?? []).find(
                (s) => s.id === button.dataset.id && s.tableId === deps.scope(),
              );
              if (action === "new") await edit();
              else if (action === "import") {
                const json = await platform.importTemplates();
                if (json === null) return;
                let incoming: Snippet[];
                try {
                  incoming = importSnippets(json, deps.scope());
                } catch {
                  throw Error("invalidSnippetImport");
                }
                const next = {
                  ...deps.get(),
                  snippets: [...(deps.get().snippets ?? []), ...incoming],
                };
                validateWorkspace(next);
                if (
                  !(await deps.confirm(
                    l(
                      "Import these snippets as new copies into this location?\n",
                      "将以下片段作为新副本导入当前位置？\n",
                    ) +
                      incoming
                        .slice(0, 10)
                        .map((s) => s.title)
                        .join("\n"),
                    l("Import snippets", "导入片段"),
                  ))
                )
                  return;
                await deps.save(next);
              } else if (action === "export") {
                if (
                  !(await deps.confirm(
                    l(
                      "Snippet exports contain their saved text. Review before sharing.",
                      "导出文件包含片段的已保存文本，分享前请检查。",
                    ),
                    l("Export snippets", "导出片段"),
                  ))
                )
                  return;
                await platform.exportTemplates(
                  exportSnippets(items()),
                  "veraflow-snippets.json",
                );
              } else if (snippet) {
                if (action === "copy") {
                  await platform.copy(snippet.content);
                  deps.copied();
                } else if (action === "paste") {
                  await platform.pasteToSource(snippet.content);
                  deps.pasted();
                } else if (action === "edit" || action === "move")
                  await edit(snippet, action === "move");
                else if (action === "delete") {
                  if (
                    !(await deps.confirm(
                      l("Delete snippet: ", "删除片段：") + snippet.title,
                      l("Delete snippet", "删除片段"),
                    ))
                  )
                    return;
                  await deps.save({
                    ...deps.get(),
                    snippets: (deps.get().snippets ?? []).filter(
                      (s) => s.id !== snippet.id,
                    ),
                  });
                }
              }
            });
        });
    },
  };
}
