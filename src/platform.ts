import { invoke, isTauri } from "@tauri-apps/api/core";
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
export const platform = {
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
  if (shortcuts)
    await invoke("validate_shortcuts", { shortcuts: Object.values(shortcuts) });
  const previous = registered;
  await unregisterAll();
  const bind = async (map: Preferences["shortcuts"]) => {
    if (
      new Set(Object.values(map).map((s) => s.toLowerCase())).size !==
      actions.length
    )
      throw new Error("shortcutFailed");
    for (const action of actions)
      await register(map[action], (event) => {
        if (event.state === "Pressed") handler(action);
      });
  };
  try {
    if (shortcuts) await bind(shortcuts);
    registered = shortcuts ? { ...shortcuts } : null;
  } catch {
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
    throw new Error("shortcutFailed");
  }
}
