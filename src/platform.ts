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
let previewLibrary: Library | null = null;
export class ShortcutBindingError extends Error {
  constructor(
    public action: Action,
    public shortcut: string,
  ) {
    super("shortcutFailed");
  }
}
export const platform = {
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
  async exportTemplates(json: string) {
    if (desktop) return invoke("export_templates", { json });
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "veraflow-templates.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async importTemplates(): Promise<string | null> {
    if (desktop) return invoke("import_templates");
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
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
  async deliver(text: string | null, tab: boolean) {
    if (!desktop) throw new Error("desktopRequired");
    await invoke("deliver_email", { text, tab });
  },
  async openRepository() {
    await invoke("open_repository");
  },
  async load(): Promise<Library | null> {
    return desktop ? invoke("load_library") : previewLibrary;
  },
  async save(library: Library): Promise<void> {
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
  async compact(compact: boolean, top: boolean) {
    if (desktop) {
      const w = getCurrentWindow();
      await w.setAlwaysOnTop(compact && top);
      await w.setSize(
        new LogicalSize(compact ? 440 : 1040, compact ? 690 : 740),
      );
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
  async trayLanguage(language: string) {
    if (desktop) await invoke("set_tray_language", { language });
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
