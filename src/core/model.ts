export type Comparison = {
  mode: "exact" | "whitespace";
  caseSensitive: boolean;
  unicode: boolean;
  punctuation: boolean;
  collapseLines: boolean;
};
export const defaultComparison: Comparison = {
  mode: "whitespace",
  caseSensitive: true,
  unicode: true,
  punctuation: false,
  collapseLines: true,
};
export type EmailHeader = "subject" | "to" | "cc" | "bcc";
export const defaultEmailOrder: EmailHeader[] = ["subject", "to", "cc", "bcc"];
export type EmailTemplate = {
  subjectEnabled?: boolean;
  order?: EmailHeader[];
  enabled: boolean;
  subject: string;
  to: string;
  cc: string;
  bcc: string;
  ccEnabled: boolean;
  bccEnabled: boolean;
};
export const defaultEmail: EmailTemplate = {
  enabled: false,
  subject: "",
  to: "",
  cc: "",
  bcc: "",
  ccEnabled: false,
  bccEnabled: false,
};
export type Template = {
  placeholderStyle?: "angle" | "braces";
  email?: EmailTemplate;
  id: string;
  name: string;
  folder: string;
  content: string;
  fieldOrder: string[];
  verificationEnabled: boolean;
  comparison: Comparison;
};
export const actions = [
  "capture",
  "previous",
  "next",
  "clear",
  "skip",
  "verify",
  "cancel",
  "finish",
] as const;
export type Action = (typeof actions)[number];
export type Preferences = {
  language: "en" | "zh-CN";
  theme: "SYSTEM" | "LIGHT" | "DARK";
  launchAtLogin: boolean;
  minimizeToTray: boolean;
  alwaysOnTop: boolean;
  globalShortcuts: boolean;
  autoAdvance: boolean;
  verifiedBackground: boolean;
  verificationDefault: boolean;
  clearAfterCompletion: boolean;
  restoreClipboard: boolean;
  clipboardPreservationConfigured?: boolean;
  shortcutDefaultsConfigured?: boolean;
  comparison: Comparison;
  shortcuts: Record<Action, string>;
};
export const defaultPreferences: Preferences = {
  language: "en",
  theme: "SYSTEM",
  launchAtLogin: false,
  minimizeToTray: true,
  alwaysOnTop: true,
  globalShortcuts: true,
  autoAdvance: true,
  verifiedBackground: false,
  verificationDefault: true,
  clearAfterCompletion: true,
  restoreClipboard: false,
  clipboardPreservationConfigured: true,
  shortcutDefaultsConfigured: true,
  comparison: { ...defaultComparison },
  shortcuts: {
    capture: "CommandOrControl+Alt+1",
    previous: "CommandOrControl+Alt+2",
    next: "CommandOrControl+Alt+3",
    clear: "CommandOrControl+Alt+4",
    skip: "CommandOrControl+Alt+5",
    verify: "CommandOrControl+Alt+6",
    cancel: "CommandOrControl+Alt+7",
    finish: "CommandOrControl+Alt+8",
  },
};
export type Library = {
  version: 1;
  templates: Template[];
  preferences: Preferences;
};
export type Field = {
  removeBlankLines?: boolean;
  name: string;
  value: string | null;
  status: "empty" | "captured" | "verified" | "mismatch" | "skipped";
  candidate?: string;
};
export type Session = {
  scanner?: boolean;
  template: Template;
  fields: Field[];
  active: number;
  mode: "capture" | "verify" | "ready" | "delivery" | "review" | "complete";
  deliveryIndex?: number;
  deliveryDone?: boolean;
};

// One-time migration: existing installations must receive the new opt-in default too.
export function migrateClipboardPreference(library: Library): boolean {
  if (library.preferences.clipboardPreservationConfigured === true)
    return false;
  library.preferences.restoreClipboard = false;
  library.preferences.clipboardPreservationConfigured = true;
  return true;
}

// Replace only stock bindings. Preserve custom shortcuts and avoid new collisions.
export function migrateShortcutDefaults(library: Library): boolean {
  if (library.preferences.shortcutDefaultsConfigured === true) return false;
  const normalize = (binding: string) =>
    binding
      .toLowerCase()
      .split("+")
      .map((part) => {
        part = part.trim();
        if (
          [
            "commandorcontrol",
            "commandorctrl",
            "control",
            "ctrl",
            "command",
            "cmd",
            "meta",
            "super",
          ].includes(part)
        )
          return "primary";
        return part === "option" ? "alt" : part;
      })
      .sort()
      .join("+");
  for (const [index, action] of actions.entries()) {
    if (
      library.preferences.shortcuts[action] !==
      `CommandOrControl+Shift+${index + 1}`
    )
      continue;
    const next = defaultPreferences.shortcuts[action];
    if (
      actions.some(
        (other) =>
          other !== action &&
          normalize(library.preferences.shortcuts[other]) === normalize(next),
      )
    )
      continue;
    library.preferences.shortcuts[action] = next;
  }
  library.preferences.shortcutDefaultsConfigured = true;
  return true;
}
