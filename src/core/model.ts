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
export type EmailTemplate = {
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
  restoreClipboard: true,
  comparison: { ...defaultComparison },
  shortcuts: {
    capture: "CommandOrControl+Shift+1",
    previous: "CommandOrControl+Shift+2",
    next: "CommandOrControl+Shift+3",
    clear: "CommandOrControl+Shift+4",
    skip: "CommandOrControl+Shift+5",
    verify: "CommandOrControl+Shift+6",
    cancel: "CommandOrControl+Shift+7",
    finish: "CommandOrControl+Shift+8",
  },
};
export type Library = {
  version: 1;
  templates: Template[];
  preferences: Preferences;
};
export type Field = {
  name: string;
  value: string | null;
  status: "empty" | "captured" | "verified" | "mismatch" | "skipped";
  candidate?: string;
};
export type Session = {
  template: Template;
  fields: Field[];
  active: number;
  mode: "capture" | "verify" | "ready" | "delivery" | "complete";
  deliveryIndex?: number;
  deliveryDone?: boolean;
};
