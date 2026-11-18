import type { SectionKey } from "./core/source";
import { invoke, isTauri, Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  actions,
  type Action,
  type Library,
  type Preferences,
} from "./core/model";
export const desktop = isTauri();
export const testBuild =
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    .VITE_TEST_BUILD === "1";
export const buildCommit =
  (
    (import.meta as ImportMeta & { env: Record<string, string> }).env
      .VITE_BUILD_COMMIT ?? ""
  )
    .match(/^[a-f0-9]{7,40}$/i)?.[0]
    .slice(0, 8) ?? "local";
let previewLibrary: Library | null = null;
let compactWindow = false;
let formWindow = false;

function savedWindowSize(mode: "scanner" | "form") {
  try {
    const size: unknown = JSON.parse(
      localStorage.getItem(`veraflow.size.${mode}`) ?? "null",
    );
    if (
      Array.isArray(size) &&
      size.length === 2 &&
      size.every(
        (value) => Number.isFinite(value) && value >= 300 && value <= 8192,
      )
    )
      return new LogicalSize(size[0], size[1]);
  } catch {
    // Window size is optional if local storage is unavailable.
  }
}
async function rememberWindowSize(
  w: ReturnType<typeof getCurrentWindow>,
  mode: "scanner" | "form",
) {
  try {
    const scale = await w.scaleFactor();
    const size = await w.innerSize();
    localStorage.setItem(
      `veraflow.size.${mode}`,
      JSON.stringify([size.width / scale, size.height / scale]),
    );
  } catch {
    // Keep the normal window transition available if saving the size fails.
  }
}
let normalBounds: {
  size: Awaited<ReturnType<ReturnType<typeof getCurrentWindow>["innerSize"]>>;
  position: Awaited<
    ReturnType<ReturnType<typeof getCurrentWindow>["outerPosition"]>
  >;
} | null = null;
export class ShortcutBindingError extends Error {
  constructor(
    public action: Action,
    public shortcut: string,
  ) {
    super("shortcutFailed");
  }
}
export type OutputLabel = { title: string; time: number };
const browserOutputs: (OutputLabel & { text: string })[] = [];
export type RecentDocument = { title: string; file: string };
const browserRecent: { file: File; title: string }[] = [];
const browserTokens = new Map<number, File>();
let nextDocumentToken = 1;
async function browserDocument(
  file: File,
  templateOnly: boolean,
): Promise<OpenDocument> {
  const csv = /\.csv$/i.test(file.name);
  if (!(csv && !templateOnly) && !/\.(veraflow|vf)$/i.test(file.name))
    throw Error("invalidImport");
  const recentToken = csv ? null : nextDocumentToken++;
  if (recentToken !== null) {
    if (browserTokens.size >= 12)
      browserTokens.delete(browserTokens.keys().next().value!);
    browserTokens.set(recentToken, file);
  }
  return {
    name: file.name,
    format: csv ? "csv" : "source",
    content:
      file.size > 16 * 1024 * 1024
        ? null
        : new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          ),
    recentToken,
  };
}
export type FolderListing = { name: string; files: string[] };
let browserFolder: { listing: FolderListing; templates: File[] } | null = null;
export type OpenDocument = {
  name: string;
  format: "source" | "csv";
  content: string | null;
  recentToken?: number | null;
};
export const platform = {
  async documentEvents(ready: () => void) {
    if (!desktop) return;
    // Subscribe before draining the queue so startup and later file opens use the same path.
    await listen("document-open", ready);
    ready();
  },
  async takeDocument(): Promise<OpenDocument | null> {
    return invoke("take_document");
  },
  async recentDocuments(): Promise<RecentDocument[]> {
    return desktop
      ? invoke("recent_documents")
      : browserRecent.map(({ file, title }) => ({ title, file: file.name }));
  },
  async rememberDocument(token: number, title: string) {
    if (desktop) return invoke("remember_document", { token, title });
    const file = browserTokens.get(token);
    if (!file) return;
    browserTokens.delete(token);
    const existing = browserRecent.findIndex((recent) => recent.file === file);
    if (existing >= 0) browserRecent.splice(existing, 1);
    browserRecent.unshift({ file, title });
    browserRecent.splice(12);
  },
  async openRecentDocument(index: number): Promise<OpenDocument> {
    if (desktop) return invoke("open_recent_document", { index });
    const entry = browserRecent[index];
    if (!entry) throw Error("recentMissing");
    return browserDocument(entry.file, true);
  },
  async clearRecentDocuments() {
    if (desktop) return invoke("clear_recent_documents");
    browserRecent.length = 0;
  },
  async pickDocument(templateOnly = false): Promise<OpenDocument | null> {
    if (desktop) return invoke("pick_document", { templateOnly });
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = templateOnly ? ".veraflow,.vf" : ".veraflow,.vf,.csv";
      input.oncancel = () => resolve(null);
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        try {
          resolve(await browserDocument(file, templateOnly));
        } catch {
          reject(Error("invalidImport"));
        }
      };
      input.click();
    });
  },
  // The browser can list only files supplied by its picker. The desktop can refresh from disk.
  async pickTemplateFolder(): Promise<FolderListing | null> {
    if (desktop) return invoke("pick_template_folder");
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.webkitdirectory = true;
      input.oncancel = () => resolve(null);
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) return resolve(null);
        const templates = files
          .filter(
            (file) =>
              /\.(veraflow|vf)$/i.test(file.name) &&
              file.webkitRelativePath
                .split("/")
                .slice(1)
                .every((part) => !part.startsWith(".")),
          )
          .sort((a, b) =>
            a.webkitRelativePath.localeCompare(b.webkitRelativePath),
          );
        const listing = {
          name: files[0].webkitRelativePath.split("/")[0],
          files: templates.map((file) =>
            file.webkitRelativePath.split("/").slice(1).join("/"),
          ),
        };
        browserFolder = { listing, templates };
        resolve(listing);
      };
      input.click();
    });
  },
  async refreshTemplateFolder(): Promise<FolderListing> {
    if (desktop) return invoke("refresh_template_folder");
    if (!browserFolder) throw Error("folderReadFailed");
    return browserFolder.listing;
  },
  async openFolderTemplate(index: number): Promise<OpenDocument> {
    if (desktop) return invoke("open_folder_template", { index });
    const file = browserFolder?.templates[index];
    if (!file) throw Error("recentMissing");
    return browserDocument(file, true);
  },
  async listOutputs(): Promise<OutputLabel[]> {
    return desktop
      ? invoke("list_outputs")
      : browserOutputs.map(({ title, time }) => ({ title, time }));
  },
  async readOutput(index: number): Promise<string> {
    if (desktop) return invoke("read_output", { index });
    const entry = browserOutputs[index];
    if (!entry) throw Error("storageFailed");
    return entry.text;
  },
  async recordOutput(title: string, text: string, limit: number) {
    if (desktop) return invoke("record_output", { title, text, limit });
    browserOutputs.unshift({
      title,
      time: Math.floor(Date.now() / 1000),
      text,
    });
    browserOutputs.splice(limit);
  },
  async trimOutputs(limit: number) {
    if (desktop) return invoke("trim_outputs", { limit });
    browserOutputs.splice(limit);
  },
  async mouseSource(enabled: boolean): Promise<boolean> {
    return desktop ? invoke("mouse_source", { enabled }) : false;
  },
  async mouseTransfer(restore: boolean): Promise<string> {
    if (!desktop) throw Error("desktopRequired");
    return invoke("mouse_transfer", { restore });
  },
  async checkUpdate(): Promise<{ version: string; notes: string } | null> {
    if (!desktop) throw Error("desktopRequired");
    return invoke("check_update");
  },
  async installUpdate(
    onProgress: (event: {
      stage: "downloading" | "installing";
      downloaded?: number;
      total?: number;
    }) => void,
  ) {
    if (!desktop) throw Error("desktopRequired");
    const progress = new Channel<Parameters<typeof onProgress>[0]>();
    progress.onmessage = onProgress;
    await invoke("install_update", { progress });
  },
  async exportTemplates(
    json: string,
    filename = "veraflow-templates.json",
  ): Promise<boolean> {
    if (desktop) return invoke("export_templates", { json, filename });
    const url = URL.createObjectURL(
      new Blob([json], {
        type: filename.endsWith(".json")
          ? "application/json"
          : "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  async importTemplates(
    format: "json" | "csv" | "source" = "json",
  ): Promise<string | null> {
    if (desktop)
      return invoke("import_templates", {
        csv: format === "csv",
        source: format === "source",
      });
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept =
        format === "csv"
          ? ".csv,text/csv,text/tab-separated-values"
          : format === "source"
            ? ".veraflow,.vf,.txt"
            : ".json,application/json";
      input.oncancel = () => resolve(null);
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(
          file ? (file.size > 16 * 1024 * 1024 ? "" : await file.text()) : null,
        );
      };
      input.click();
    });
  },
  async pasteToSource(text: string) {
    if (!desktop) throw new Error("desktopRequired");
    await invoke("deliver_email", { text, tab: false, restoreSource: true });
  },
  async deliveryTarget(): Promise<string> {
    if (!desktop) throw new Error("desktopRequired");
    return invoke("delivery_target");
  },
  async deliver(
    text: string | null,
    navigation: boolean | SectionKey[],
    target?: string,
  ) {
    if (!desktop) throw new Error("desktopRequired");
    await invoke("deliver_email", {
      text,
      tab: navigation === true,
      navigation: Array.isArray(navigation) ? navigation : undefined,
      target,
    });
  },
  async openRepository() {
    await invoke("open_repository");
  },
  async load(): Promise<Library | null> {
    return desktop ? invoke("load_library") : previewLibrary;
  },
  async save(library: Library): Promise<void> {
    if (
      new TextEncoder().encode(JSON.stringify(library)).length >
      16 * 1024 * 1024
    )
      throw Error("invalidLibrary");
    if (desktop) await invoke("save_library", { library });
    else previewLibrary = structuredClone(library);
  },
  async capture(restore: boolean): Promise<string> {
    if (!desktop) throw new Error("desktopRequired");
    return invoke("capture_selection", { restore });
  },
  async readClipboard(): Promise<string> {
    return desktop ? invoke("read_clipboard") : navigator.clipboard.readText();
  },
  async copy(text: string): Promise<void> {
    if (desktop) await invoke("write_clipboard", { text });
    else await navigator.clipboard.writeText(text);
  },
  async active(active: boolean) {
    if (desktop) await invoke("set_session_active", { active });
  },
  async compact(compact: boolean, top: boolean, form = false) {
    if (desktop) {
      const w = getCurrentWindow();
      if (formWindow && !form) await rememberWindowSize(w, "form");
      if (compactWindow && !compact) await rememberWindowSize(w, "scanner");
      const formSize =
        form && !formWindow ? savedWindowSize("form") : undefined;
      if (compact === compactWindow) {
        if (formSize) await w.setSize(formSize);
        formWindow = form;
        await w.setAlwaysOnTop(compact && top);
        return;
      }
      const nativePlacement = await invoke<boolean>("session_window", {
        compact,
      });
      if (compact) {
        normalBounds = {
          size: await w.innerSize(),
          position: await w.outerPosition(),
        };
        await w.setSize(
          savedWindowSize("scanner") ?? new LogicalSize(740, 690),
        );
      } else if (!nativePlacement && normalBounds) {
        await w.setSize(normalBounds.size);
        await w.setPosition(normalBounds.position);
      }
      if (formSize) await w.setSize(formSize);
      formWindow = form;
      compactWindow = compact;
      await w.setAlwaysOnTop(compact && top);
      if (!compact) normalBounds = null;
    }
  },
  async reveal() {
    if (desktop) {
      const w = getCurrentWindow();
      await w.show();
      await w.setFocus();
    }
  },
  async quit() {
    if (desktop) await invoke("quit_app");
  },
  async trayMenu(language: string, updateAvailable: boolean) {
    if (desktop) await invoke("set_tray_menu", { language, updateAvailable });
  },
  async autostart(on: boolean) {
    if (desktop && (await isEnabled()) !== on)
      await (on ? enable() : disable());
  },
  async tray(handler: (action: string) => void) {
    if (desktop)
      await listen<string>("tray-action", (event) => handler(event.payload));
  },
};
let registered: Preferences["shortcuts"] | null = null;
export async function bindShortcuts(
  shortcuts: Preferences["shortcuts"] | null,
  handler: (action: Action) => void,
): Promise<void> {
  if (!desktop) return;
  if (shortcuts) {
    const active = actions.filter((a) => shortcuts[a].trim());
    try {
      await invoke("validate_shortcuts", {
        shortcuts: active.map((a) => shortcuts[a]),
      });
    } catch (error) {
      const index = Number(String(error).split(":").at(-1));
      const action = active[Number.isInteger(index) ? index : 0] ?? "capture";
      throw new ShortcutBindingError(action, shortcuts[action]);
    }
  }
  const previous = registered;
  await unregisterAll();
  const bind = async (map: Preferences["shortcuts"]) => {
    for (const action of actions) {
      if (!map[action].trim()) continue;
      try {
        await register(map[action], (event) => {
          if (event.state === "Pressed") handler(action);
        });
      } catch {
        throw new ShortcutBindingError(action, map[action]);
      }
    }
  };
  try {
    if (shortcuts) await bind(shortcuts);
    registered = shortcuts ? { ...shortcuts } : null;
  } catch (error) {
    await unregisterAll();
    registered = null;
    if (previous) {
      try {
        await bind(previous);
        registered = previous;
      } catch {
        await unregisterAll();
        throw new Error("shortcutFailed");
      }
    }
    throw error;
  }
}
