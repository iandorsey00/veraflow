import "./style.css";
import { en } from "./locales/en";
import { zh } from "./locales/zh-CN";
import {
  actions,
  defaultPreferences,
  type Action,
  type Comparison,
  type Library,
  type Preferences,
  type Session,
  type Template,
} from "./core/model";
import { orderFields } from "./core/template";
import { difference } from "./core/compare";
import {
  startSession,
  capture,
  verify,
  move,
  clear,
  skip,
  beginVerification,
  renderSession,
  eraseSession,
} from "./core/session";
import { platform, desktop, bindShortcuts } from "./platform";

type Key = keyof typeof en;
const root = document.querySelector<HTMLDivElement>("#app")!;
let library: Library = {
  version: 1,
  templates: [],
  preferences: structuredClone(defaultPreferences),
};
let view: "templates" | "settings" | "session" = "templates";
let selected = "",
  draft: Template | null = null,
  settingsDraft: Preferences | null = null,
  session: Session | null = null;
let pendingFocus: string | null = null;
let manualOpen = false;
let quitting = false;
let dirty = false,
  busy = false,
  locked = false,
  preview = false,
  message = "",
  failure = false,
  search = "",
  folder = "";
const t = (key: Key): string =>
  (library.preferences.language === "zh-CN" ? zh : en)[key];
const esc = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const tr = (key: string) => (key in en ? t(key as Key) : t("error"));
const button = (id: string, key: Key, cls = "", disabled = false) =>
  `<button id="${id}" class="${cls}" ${disabled ? "disabled" : ""}>${esc(t(key))}</button>`;
const check = (id: string, key: Key, value: boolean) =>
  `<label class="check"><input type="checkbox" id="${id}" ${value ? "checked" : ""}>${esc(t(key))}</label>`;
const field = (id: string, key: Key, value: string, extra = "") =>
  `<label for="${id}">${esc(t(key))}</label><input id="${id}" value="${esc(value)}" ${extra}>`;
function notify(key: Key, error = false) {
  message = t(key);
  failure = error;
  render();
}
function report(error: unknown) {
  const key = error instanceof Error ? error.message : String(error);
  message = tr(key);
  failure = true;
  render();
}
async function run(work: () => Promise<void> | void) {
  if (busy) return;
  pendingFocus = document.hasFocus()
    ? (document.activeElement as HTMLElement | null)?.id || null
    : null;
  busy = true;
  root.inert = true;
  root.setAttribute("aria-busy", "true");
  try {
    await work();
  } catch (error) {
    report(error);
  } finally {
    if (!quitting)
      await platform
        .active(dirty || (!!session && session.mode !== "complete"))
        .catch(report);
    busy = false;
    root.inert = false;
    root.removeAttribute("aria-busy");
    if (pendingFocus) {
      document.getElementById(pendingFocus)?.focus();
      pendingFocus = null;
    }
  }
}
function on(id: string, event: string, handler: (event: Event) => void) {
  document.getElementById(id)?.addEventListener(event, handler);
}
function click(id: string, handler: () => Promise<void> | void) {
  on(id, "click", () => void run(handler));
}
function focus(id: string) {
  if (busy) pendingFocus = id;
  else document.getElementById(id)?.focus();
}
function applyAppearance() {
  document.documentElement.lang = library.preferences.language;
  document.documentElement.dataset.theme = library.preferences.theme;
}
function render() {
  applyAppearance();
  root.className = view === "session" ? "compact" : "";
  root.innerHTML = `${view !== "session" ? `<header class="appbar"><span class="wordmark">VeraFlow <span lang="zh-CN">核流</span></span><nav aria-label="${esc(t("app"))}">${button("nav-templates", "templates", view === "templates" ? "selected" : "")}${session ? button("nav-session", "session") : ""}${button("nav-settings", "settings", view === "settings" ? "selected" : "")}</nav></header>` : ""}
    ${!desktop ? `<aside class="preview-banner">${esc(t("browserPreview"))}</aside>` : ""}
    <div id="notice" role="${failure ? "alert" : "status"}" class="notice ${failure ? "error" : "success"}" ${message ? "" : "hidden"}>${esc(message)}</div>
    ${view === "templates" ? libraryView() : view === "settings" ? settingsView() : sessionView()}
    ${view !== "session" ? `<footer><span>◉ ${esc(t("localOnly"))}</span><span>${esc(t("localNote"))}</span></footer>` : ""}`;
  click("nav-templates", () => navigate("templates"));
  click("nav-settings", () => navigate("settings"));
  click("nav-session", () => navigate("session"));
  if (view === "session")
    root
      .querySelector(".capture-field.active")
      ?.scrollIntoView({ block: "nearest" });
  if (view === "templates") bindLibrary();
  else if (view === "settings") bindSettings();
  else bindSession();
}
function libraryView(): string {
  const items = library.templates.filter(
    (item) =>
      (!folder || item.folder === folder) &&
      `${item.name} ${item.folder}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return `<div class="library-layout"><aside class="sidebar"><div class="section-head"><h1>${esc(t("templates"))}</h1>${button("new", "newTemplate", "primary", locked)}</div>
    <label class="sr-only" for="search">${esc(t("search"))}</label><input type="search" id="search" placeholder="${esc(t("search"))}" value="${esc(search)}">
    <label class="sr-only" for="folder-filter">${esc(t("folder"))}</label><select id="folder-filter"><option value="">${esc(t("allFolders"))}</option>${[
      ...new Set(library.templates.map((x) => x.folder).filter(Boolean)),
    ]
      .sort()
      .map(
        (name) =>
          `<option ${name === folder ? "selected" : ""}>${esc(name)}</option>`,
      )
      .join("")}</select>
    <div class="template-list">${items.map((item) => `<button class="template-item ${selected === item.id ? "selected" : ""}" data-template="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${esc(item.folder)}${item.folder ? " · " : ""}${orderFields(item.content).length} ${esc(t("fieldCount"))}</span></button>`).join("") || `<p class="muted">${esc(t(library.templates.length ? "noResults" : "noTemplates"))}</p>`}</div>
    <p class="sidebar-note">${esc(t("workflow"))}</p></aside>
    <main class="editor">${locked ? `<p role="alert">${esc(t("readOnly"))}</p>` : draft ? editorView() : `<div class="empty-state"><p class="eyebrow">${esc(t("library"))}</p><h2>${esc(t("tagline"))}</h2><p>${esc(t("createHint"))}</p>${button("empty-new", "newTemplate", "primary")}</div>`}</main></div>`;
}
function comparisonView(rules: Comparison, prefix: string): string {
  return `<label for="${prefix}-mode">${esc(t("comparison"))}</label><select id="${prefix}-mode"><option value="exact" ${rules.mode === "exact" ? "selected" : ""}>${esc(t("exact"))}</option><option value="whitespace" ${rules.mode === "whitespace" ? "selected" : ""}>${esc(t("whitespace"))}</option></select>
    ${check(prefix + "-case", "caseSensitive", rules.caseSensitive)}${check(prefix + "-unicode", "unicode", rules.unicode)}${check(prefix + "-punctuation", "punctuation", rules.punctuation)}${check(prefix + "-lines", "collapseLines", rules.collapseLines)}<p class="hint">${esc(t("rulesNote"))}</p>`;
}
function editorView(): string {
  const d = draft!;
  return `<div class="section-head"><p class="eyebrow">${esc(t("library"))}</p><div class="toolbar">${button("duplicate", "duplicate")}${button("delete", "delete", "danger")}</div></div>
  <div class="metadata"> <div>${field("template-name", "name", d.name, 'maxlength="250"')}</div><div>${field("template-folder", "folder", d.folder, 'maxlength="250"')}</div></div>
  <label for="template-content">${esc(t("content"))}</label><textarea id="template-content" class="code template-text" spellcheck="false" aria-describedby="placeholder-help">${esc(d.content)}</textarea><p id="placeholder-help" class="hint">${esc(t("placeholderHelp"))}</p>
  <div class="editor-bottom"><section><h2>${esc(t("fields"))}</h2><ol id="field-order" class="field-order">${orderView()}</ol></section><details><summary>${esc(t("templateSettings"))}</summary>${check("template-verify", "verificationEnabled", d.verificationEnabled)}${comparisonView(d.comparison, "template")}</details></div>
  <div class="actions">${button("save", "save")}${button("start", "start", "primary")}</div>`;
}
function orderView(): string {
  return (
    draft!.fieldOrder
      .map(
        (name, index) =>
          `<li><code>${esc(name)}</code><span><button data-up="${index}" aria-label="${esc(t("moveUp") + " " + name)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-down="${index}" aria-label="${esc(t("moveDown") + " " + name)}" ${index === draft!.fieldOrder.length - 1 ? "disabled" : ""}>↓</button></span></li>`,
      )
      .join("") || `<li class="hint">${esc(t("noFields"))}</li>`
  );
}
function bindOrder() {
  for (const direction of ["up", "down"])
    root.querySelectorAll<HTMLButtonElement>(`[data-${direction}]`).forEach(
      (el) =>
        (el.onclick = () => {
          if (busy) return;
          const i = Number(el.dataset[direction]),
            j = i + (direction === "up" ? -1 : 1);
          [draft!.fieldOrder[i], draft!.fieldOrder[j]] = [
            draft!.fieldOrder[j],
            draft!.fieldOrder[i],
          ];
          dirty = true;
          document.getElementById("field-order")!.innerHTML = orderView();
          bindOrder();
          root
            .querySelector<HTMLButtonElement>(`[data-${direction}="${j}"]`)
            ?.focus();
        }),
    );
}
function bindComparison(prefix: string, rules: Comparison) {
  on(prefix + "-mode", "change", (e) => {
    rules.mode = (e.target as HTMLSelectElement).value as Comparison["mode"];
    dirty = true;
  });
  for (const [suffix, key] of [
    ["case", "caseSensitive"],
    ["unicode", "unicode"],
    ["punctuation", "punctuation"],
    ["lines", "collapseLines"],
  ] as const)
    on(prefix + "-" + suffix, "change", (e) => {
      rules[key] = (e.target as HTMLInputElement).checked;
      dirty = true;
    });
}
function bindLibrary() {
  click("new", newTemplate);
  click("empty-new", newTemplate);
  on("search", "input", (e) => {
    const input = e.target as HTMLInputElement;
    search = input.value;
    render();
    focus("search");
  });
  on("folder-filter", "change", (e) => {
    folder = (e.target as HTMLSelectElement).value;
    render();
    focus("folder-filter");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-template]").forEach(
    (el) =>
      (el.onclick = () =>
        void run(async () => {
          if (!(await abandonDraft())) return;
          selectTemplate(el.dataset.template!);
          render();
          focus("template-name");
        })),
  );
  if (!draft) return;
  on("template-name", "input", (e) => {
    draft!.name = (e.target as HTMLInputElement).value;
    dirty = true;
  });
  on("template-folder", "input", (e) => {
    draft!.folder = (e.target as HTMLInputElement).value;
    dirty = true;
  });
  on("template-content", "input", (e) => {
    draft!.content = (e.target as HTMLTextAreaElement).value;
    draft!.fieldOrder = orderFields(draft!.content, draft!.fieldOrder);
    dirty = true;
    document.getElementById("field-order")!.innerHTML = orderView();
    bindOrder();
  });
  on("template-verify", "change", (e) => {
    draft!.verificationEnabled = (e.target as HTMLInputElement).checked;
    dirty = true;
  });
  bindComparison("template", draft.comparison);
  bindOrder();
  click("save", async () => {
    await saveDraft();
    notify("saved");
  });
  click("duplicate", async () => {
    draft!.id = crypto.randomUUID();
    draft!.name += ` (${t("copySuffix")})`;
    selected = draft!.id;
    dirty = true;
    render();
    focus("template-name");
  });
  click("delete", async () => {
    if (!(await confirmAction("deleteConfirm"))) return;
    const updated = library.templates.filter((item) => item.id !== draft!.id);
    await persist({ ...library, templates: updated });
    draft = null;
    selected = "";
    dirty = false;
    notify("deleted");
  });
  click("start", async () => {
    await saveDraft();
    await launch(draft!);
  });
}
function selectTemplate(id: string) {
  selected = id;
  draft = structuredClone(
    library.templates.find((item) => item.id === id) ?? null,
  );
  dirty = false;
}
async function newTemplate() {
  if (!(await abandonDraft())) return;
  draft = {
    id: crypto.randomUUID(),
    name: t("untitled"),
    folder: "",
    content: "",
    fieldOrder: [],
    verificationEnabled: library.preferences.verificationDefault,
    comparison: structuredClone(library.preferences.comparison),
  };
  selected = draft.id;
  dirty = true;
  render();
  focus("template-name");
  (document.getElementById("template-name") as HTMLInputElement).select();
}
async function persist(next: Library) {
  if (locked) throw new Error("invalidLibrary");
  await platform.save(next);
  library = next;
}
async function saveDraft() {
  if (!draft?.name.trim()) throw new Error("nameRequired");
  const saved = structuredClone(draft);
  saved.name = saved.name.trim();
  await persist({
    ...library,
    templates: library.templates.some((item) => item.id === saved.id)
      ? library.templates.map((item) => (item.id === saved.id ? saved : item))
      : [...library.templates, saved],
  });
  draft = saved;
  dirty = false;
}
async function abandonDraft() {
  if (dirty && !(await confirmAction("discardConfirm"))) return false;
  dirty = false;
  return true;
}
async function navigate(next: typeof view) {
  if (!(await abandonDraft())) return;
  if (next === "session" && !session) return;
  view = next;
  message = "";
  if (next === "templates" && selected) selectTemplate(selected);
  if (next === "settings") settingsDraft = structuredClone(library.preferences);
  await platform.compact(next === "session", library.preferences.alwaysOnTop);
  render();
}
function settingsView(): string {
  const p = (settingsDraft ??= structuredClone(library.preferences));
  return `<main class="settings"><header><h1>${esc(t("settings"))}</h1></header><div class="settings-grid"><section><h2>${esc(t("general"))}</h2><label for="language">${esc(t("language"))}</label><select id="language"><option value="en" ${p.language === "en" ? "selected" : ""}>English</option><option value="zh-CN" ${p.language === "zh-CN" ? "selected" : ""}>简体中文</option></select><label for="theme">${esc(t("theme"))}</label><select id="theme">${(["SYSTEM", "LIGHT", "DARK"] as const).map((theme) => `<option value="${theme}" ${theme === p.theme ? "selected" : ""}>${esc(t(theme))}</option>`).join("")}</select>${check("launchAtLogin", "launchAtLogin", p.launchAtLogin)}${check("minimizeToTray", "minimizeToTray", p.minimizeToTray)}${check("alwaysOnTop", "alwaysOnTop", p.alwaysOnTop)}${check("autoAdvance", "autoAdvance", p.autoAdvance)}</section>
  <section><h2>${esc(t("verification"))}</h2>${check("verificationDefault", "verificationDefault", p.verificationDefault)}${comparisonView(p.comparison, "default")}</section>
  <section><h2>${esc(t("privacy"))}</h2>${check("clearAfterCompletion", "clearAfterCompletion", p.clearAfterCompletion)}${check("restoreClipboard", "restoreClipboard", p.restoreClipboard)}<p class="hint">${esc(t("quitPrivacy"))}</p></section>
  <section><h2>${esc(t("shortcuts"))}</h2><p class="hint">${esc(t("shortcutHelp"))}</p>${actions.map((action) => field("key-" + action, action === "cancel" ? "cancelSession" : action, p.shortcuts[action], 'class="shortcut-input"')).join("")}</section></div><div class="actions">${button("save-settings", "saveSettings", "primary", locked)}</div><section class="about" aria-labelledby="about-heading"><h2 id="about-heading">${esc(t("about"))}</h2><p>${esc(t("copyright"))}</p><a id="repository-link" href="https://github.com/iandorsey00/veraflow" target="_blank" rel="noopener noreferrer">${esc(t("repository"))}</a></section></main>`;
}
function bindSettings() {
  if (desktop)
    on("repository-link", "click", (event) => {
      event.preventDefault();
      void run(() => platform.openRepository());
    });
  const p = settingsDraft!;
  for (const key of ["language", "theme"] as const)
    on(key, "change", (e) => {
      Object.assign(p, { [key]: (e.target as HTMLSelectElement).value });
      dirty = true;
    });
  for (const key of [
    "launchAtLogin",
    "minimizeToTray",
    "alwaysOnTop",
    "autoAdvance",
    "verificationDefault",
    "clearAfterCompletion",
    "restoreClipboard",
  ] as const)
    on(key, "change", (e) => {
      p[key] = (e.target as HTMLInputElement).checked;
      dirty = true;
    });
  bindComparison("default", p.comparison);
  for (const action of actions)
    on("key-" + action, "input", (e) => {
      p.shortcuts[action] = (e.target as HTMLInputElement).value.trim();
      dirty = true;
    });
  click("save-settings", async () => {
    const old = structuredClone(library.preferences);
    if (
      new Set(Object.values(p.shortcuts).map((s) => s.toLowerCase())).size !==
      actions.length
    )
      throw new Error("shortcutFailed");
    await bindShortcuts(p.shortcuts, dispatch);
    try {
      await platform.autostart(p.launchAtLogin);
      await persist({ ...library, preferences: structuredClone(p) });
    } catch (error) {
      await bindShortcuts(
        session && session.mode !== "complete" ? old.shortcuts : null,
        dispatch,
      );
      await platform.autostart(old.launchAtLogin);
      throw error;
    }
    if (!session || session.mode === "complete")
      await bindShortcuts(null, dispatch);
    dirty = false;
    await platform.trayLanguage(p.language);
    notify("saved");
  });
}
async function launch(template: Template) {
  if (
    session &&
    session.mode !== "complete" &&
    !(await confirmAction("sessionConfirm"))
  )
    return;
  await bindShortcuts(library.preferences.shortcuts, dispatch);
  if (session) eraseSession(session);
  session = startSession(template);
  manualOpen = false;
  await platform.active(true);
  view = "session";
  preview = false;
  message = "";
  await platform.compact(true, library.preferences.alwaysOnTop);
  render();
  focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
}
function sessionView(): string {
  if (!session) return "";
  const s = session,
    p = library.preferences,
    f = s.fields[s.active];
  if (s.mode === "complete")
    return `<main class="capture-panel"><p class="eyebrow">${esc(t("app"))}</p><h1>✓ ${esc(t("complete"))}</h1><p>${esc(t("copied"))}</p><p class="muted">${esc(t(p.clearAfterCompletion ? "erased" : "retained"))}</p>${button("close-session", "closeSession", "primary")}</main>`;
  const mode = s.mode === "verify" ? "verify" : "capture";
  const done = s.fields.filter(
    (f) =>
      f.status === "verified" ||
      f.status === "skipped" ||
      (!s.template.verificationEnabled && f.status === "captured"),
  ).length;
  const symbols = {
    empty: "○",
    captured: "●",
    verified: "✓",
    mismatch: "!",
    skipped: "−",
  };
  let rendered = "";
  if (preview) {
    try {
      rendered = renderSession(s);
    } catch {
      preview = false;
    }
  }
  return `<main class="capture-panel"><div class="section-head"><span class="wordmark small">VeraFlow <span lang="zh-CN">核流</span></span>${button("session-back", "templates")}</div><p class="eyebrow" role="status">${esc(t(s.mode))} · ${done}/${s.fields.length}</p><h1>${esc(s.template.name)}</h1><p class="hint">${esc(t(mode === "verify" ? "verifyHelp" : "captureHelp"))}</p><kbd>${esc(p.shortcuts[mode])}</kbd>
  <ol class="capture-fields" aria-label="${esc(t("fields"))}">${s.fields.map((field, index) => `<li><button id="field-${index}" data-field="${index}" class="capture-field ${index === s.active ? "active" : ""} ${field.status}" ${index === s.active ? 'aria-current="step"' : ""}><span class="state-icon" aria-hidden="true">${index === s.active ? "→" : symbols[field.status]}</span><span class="field-body"><strong>${esc(field.name)}</strong><span class="field-value">${esc(field.value ?? "—")}</span></span><span class="status-label">${esc(t(field.status))}</span></button></li>`).join("")}</ol>
  ${f ? `<details class="inspect"><summary>${esc(t("expand"))}: ${esc(f.name)}</summary><pre>${esc(f.value ?? "—")}</pre></details>` : ""}
  ${f?.status === "mismatch" ? mismatchView(f.value!, f.candidate!) : ""}
  ${s.mode !== "ready" && f ? `<details id="manual-entry" ${manualOpen ? "open" : ""}><summary>${esc(t("manualEntry"))}</summary><form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label><textarea id="manual-value" rows="2" spellcheck="false"></textarea><div class="toolbar">${button("apply-value", mode === "verify" ? "compare" : "apply", "primary")}${button("use-clipboard", "clipboard")}</div></form><p class="hint">${esc(t("clipboardHelp"))}</p></details>` : ""}
  <div class="toolbar navigation">${button("previous", "previous")}${button("next", "next")}${button("clear", "clear")}${button("skip", "skip")}</div>
  ${s.mode === "ready" ? `<div class="actions">${button("preview", "preview")}${button("finish", "finish", "primary")}</div>` : `<div class="actions">${button("verify-start", "verifyStart")}${!s.template.verificationEnabled ? button("finish", "finish", "primary") : ""}</div>`}
  ${preview ? `<pre class="output">${esc(rendered)}</pre>` : ""}
  <details><summary>${esc(t("help"))}</summary><dl class="shortcut-list">${actions.map((a) => `<dt>${esc(t(a === "cancel" ? "cancelSession" : a))}</dt><dd><kbd>${esc(p.shortcuts[a])}</kbd></dd>`).join("")}</dl></details>
  <div class="actions">${button("cancel-session", "cancelSession", "quiet danger")}</div></main>`;
}
function mismatchView(a: string, b: string): string {
  const diff = difference(a, b);
  return `<section class="mismatch-box" role="alert"><h2>! ${esc(t("mismatch"))}</h2><p>${esc(t("mismatchHelp"))}</p>${diff.map((part, index) => `<h3>${esc(t(index ? "selectedValue" : "capturedValue"))}</h3><pre>${esc(part.before)}<mark>${esc(part.middle) || "∅"}</mark>${esc(part.after)}</pre>`).join("")}${button("correct-value", "editValue")}</section>`;
}
function bindSession() {
  click("session-back", () => navigate("templates"));
  click("close-session", closeSession);
  root.querySelectorAll<HTMLButtonElement>("[data-field]").forEach(
    (el) =>
      (el.onclick = () =>
        void run(() => {
          session!.active = Number(el.dataset.field);
          preview = false;
          render();
          root
            .querySelector<HTMLButtonElement>(
              `[data-field="${session!.active}"]`,
            )
            ?.focus();
        })),
  );
  on("manual-entry", "toggle", (e) => {
    manualOpen = (e.target as HTMLDetailsElement).open;
  });
  on("manual-form", "submit", (e) => e.preventDefault());
  click("apply-value", async () => {
    const input = document.getElementById(
      "manual-value",
    ) as HTMLTextAreaElement;
    await accept(input.value);
  });
  click("use-clipboard", async () => accept(await platform.readClipboard()));
  for (const action of [
    "previous",
    "next",
    "clear",
    "skip",
    "finish",
  ] as Action[])
    click(action, () => perform(action));
  click("verify-start", () => {
    beginVerification(session!);
    message = "";
    render();
    focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
  });
  click("preview", () => {
    preview = !preview;
    render();
    focus("finish");
  });
  click("cancel-session", () => perform("cancel"));
  click("correct-value", () => {
    session!.mode = "capture";
    manualOpen = true;
    render();
    const input = document.getElementById(
      "manual-value",
    ) as HTMLTextAreaElement;
    input.value = session!.fields[session!.active].value ?? "";
    focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
  });
}
async function accept(value: string) {
  if (!session) return;
  if (value.length > 1024 * 1024) throw new Error("invalidText");
  if (session.mode === "verify")
    verify(session, value, library.preferences.autoAdvance);
  else capture(session, value, library.preferences.autoAdvance);
  message = "";
  preview = false;
  render();
  focus(
    session.mode === "ready"
      ? "finish"
      : manualOpen
        ? "manual-value"
        : `field-${session.active}`,
  );
}
function dispatch(action: Action) {
  void run(() => perform(action));
}
async function perform(action: Action) {
  const s = session;
  if (!s || s.mode === "complete") return;
  // Global navigation is frozen while an editor/settings screen or confirmation is open.
  if (view !== "session") return;
  switch (action) {
    case "capture":
      if (s.mode === "verify")
        await accept(
          await platform.capture(library.preferences.restoreClipboard),
        );
      else if (s.mode !== "ready")
        await accept(
          await platform.capture(library.preferences.restoreClipboard),
        );
      return;
    case "verify":
      if (s.mode === "capture") {
        beginVerification(s);
        break;
      }
      if (s.mode === "verify")
        await accept(
          await platform.capture(library.preferences.restoreClipboard),
        );
      return;
    case "previous":
      move(s, -1);
      break;
    case "next":
      move(s, 1);
      break;
    case "clear":
      clear(s);
      break;
    case "skip":
      if (
        s.fields[s.active]?.value !== null &&
        !(await confirmAction("skipConfirm"))
      )
        return;
      skip(s, library.preferences.autoAdvance);
      break;
    case "cancel":
      if (await confirmAction("sessionConfirm")) await closeSession();
      return;
    case "finish": {
      const output = renderSession(s);
      await platform.copy(output);
      if (library.preferences.clearAfterCompletion) eraseSession(s);
      else s.mode = "complete";
      preview = false;
      await bindShortcuts(null, dispatch);
      await platform.active(false);
      notify("copied");
      return;
    }
  }
  preview = false;
  message = "";
  render();
  focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
}
async function closeSession() {
  if (session) eraseSession(session);
  session = null;
  await bindShortcuts(null, dispatch);
  await platform.active(false);
  await navigate("templates");
}
async function confirmAction(key: Key): Promise<boolean> {
  await platform.reveal();
  const prior = document.activeElement as HTMLElement | null;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "confirmation-title");
  dialog.innerHTML = `<form method="dialog"><h2 id="confirmation-title">${esc(t(key))}</h2><div class="actions"><button value="no" autofocus>${esc(t("keep"))}</button><button value="yes" class="danger">${esc(t("confirm"))}</button></div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => {
        const yes = dialog.returnValue === "yes";
        dialog.remove();
        prior?.focus();
        resolve(yes);
      },
      { once: true },
    ),
  );
}
root.addEventListener("input", () => {
  if (view !== "session") void platform.active(true).catch(report);
});
root.addEventListener("change", () => {
  if (view !== "session") void platform.active(true).catch(report);
});
window.addEventListener("keydown", (event) => {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key === "Enter" &&
    view === "session"
  ) {
    event.preventDefault();
    document.getElementById("apply-value")?.click();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty || (session && session.mode !== "complete")) {
    event.preventDefault();
  }
});
async function init() {
  try {
    const saved = await platform.load();
    if (saved) library = saved;
    else {
      library.templates = [
        {
          id: crypto.randomUUID(),
          name: en.sampleName,
          folder: en.sampleFolder,
          content: en.sampleContent,
          fieldOrder: orderFields(en.sampleContent),
          verificationEnabled: true,
          comparison: structuredClone(defaultPreferences.comparison),
        },
        {
          id: crypto.randomUUID(),
          name: zh.sampleChineseName,
          folder: en.sampleFolder,
          content: zh.sampleChineseContent,
          fieldOrder: orderFields(zh.sampleChineseContent),
          verificationEnabled: true,
          comparison: structuredClone(defaultPreferences.comparison),
        },
      ];
    }
  } catch (error) {
    locked = true;
    report(error);
  }
  if (library.templates[0]) selectTemplate(library.templates[0].id);
  render();
  await platform.tray(
    (action) =>
      void run(async () => {
        if (action === "quit") {
          if (
            ((session && session.mode !== "complete") || dirty) &&
            !(await confirmAction(session ? "quitConfirm" : "discardConfirm"))
          )
            return;
          if (session) eraseSession(session);
          await bindShortcuts(null, dispatch);
          await platform.active(false);
          quitting = true;
          await platform.quit();
        } else if (action === "settings") await navigate("settings");
        else if (action === "session" && session) await navigate("session");
        else await navigate("templates");
      }),
  );
  try {
    await platform.trayLanguage(library.preferences.language);
  } catch (error) {
    report(error);
  }
}
void init();
