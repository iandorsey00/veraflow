import { workspaceUI, formDialog } from "./workspace-ui";
import {
  emptyWorkspace,
  fieldNames,
  veraId,
  rowFromScanner,
  validateWorkspace,
  exportScanner,
  importScanner,
  scannerTemplateParts,
  type DataTable,
  type DataRow,
} from "./core/workspace";
import { version as appVersion } from "../package.json";
import {
  startScanner,
  captureScanner,
  addScannerField,
  renameScannerField,
  completedFieldsToScanner,
  scannerValue,
  applyScanner,
} from "./core/scanner";
import "./style.css";
import { en } from "./locales/en";
import { zh } from "./locales/zh-CN";
import {
  actions,
  defaultPreferences,
  migrateClipboardPreference,
  migrateShortcutDefaults,
  defaultEmail,
  defaultEmailOrder,
  type Action,
  type Comparison,
  type Library,
  type Preferences,
  type Session,
  type Template,
} from "./core/model";
import {
  templateSource,
  emailSections,
  rememberedFieldOrder,
  captureFieldNames,
  validateExtraFields,
} from "./core/template";
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
  renderEmail,
  deliverEmailSection,
  moveEmailSection,
  cleanBlankLines,
  EmailHeaderError,
  eraseSession,
} from "./core/session";
import { parseTemplateArchive, exportTemplateArchive } from "./core/transfer";
import {
  platform,
  desktop,
  testBuild,
  buildCommit,
  bindShortcuts,
  ShortcutBindingError,
} from "./platform";

type Key = keyof typeof en;
const root = document.querySelector<HTMLDivElement>("#app")!;
let library: Library = {
  version: 1,
  templates: [],
  preferences: structuredClone(defaultPreferences),
};
let view: "workspace" | "scanner" | "templates" | "settings" | "session" =
  "workspace";
let selected = "",
  draft: Template | null = null,
  settingsDraft: Preferences | null = null,
  session: Session | null = null;
let retainedScanner: Session | null = null;
let returnToScanner = false;
let scannerOutput: "copy" | "paste" | "tab" = "copy";
const workspace = workspaceUI({
  get: () => library.workspace ?? emptyWorkspace(),
  save: async (value) => {
    validateWorkspace(value);
    await persist({ ...library, workspace: value });
  },
  lang: () => library.preferences.language === "zh-CN",
  render,
  run,
  open: openRow,
  confirm: (detail, action) =>
    confirmAction("workspaceConfirm", detail, action),
});
function privateWork() {
  return !!retainedScanner || (!!session && session.mode !== "complete");
}
function eraseRetainedScanner() {
  if (retainedScanner) eraseSession(retainedScanner);
  retainedScanner = null;
}
let pendingFocus: string | null = null;
let manualOpen = false;
let sessionOptionsOpen = false;
let scannerMoreOpen = false;
let extraFieldInput: string | null = null;
let extraFieldsInvalid = false;
let mouseMode = false;
let preserveClipboard = true;
let availableUpdate: Awaited<ReturnType<typeof platform.checkUpdate>> = null;
let updateCheck: Promise<
  Awaited<ReturnType<typeof platform.checkUpdate>>
> | null = null;
let watchingSource = false;
let mousePolling = false;
setInterval(async () => {
  if (mousePolling) return;
  const enabled =
    mouseMode &&
    view === "session" &&
    !!session &&
    ["capture", "verify"].includes(session.mode);
  if (!enabled && !watchingSource) return;
  mousePolling = true;
  try {
    watchingSource = enabled;
    const available = await platform.mouseSource(enabled);
    const transfer = document.getElementById(
      "mouse-transfer",
    ) as HTMLButtonElement | null;
    if (transfer) transfer.disabled = busy || !available;
  } catch {
    /* Transfer reports an actionable error when requested. */
  } finally {
    mousePolling = false;
  }
}, 250);
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
  message =
    error instanceof ShortcutBindingError
      ? `${t("shortcutFailed")} ${t(error.action === "cancel" ? "cancelSession" : error.action)}: ${error.shortcut}`
      : error instanceof EmailHeaderError
        ? `${t(error.section)}: ${t("emailHeaderInvalid")}`
        : tr(key);
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
    if (!quitting) await platform.active(dirty || privateWork()).catch(report);
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
  root.innerHTML = `${view !== "session" ? `<header class="appbar"><span class="wordmark">VeraFlow <span lang="zh-CN">核流</span></span><nav aria-label="${esc(t("app"))}">${button("nav-workspace", "workspace", view === "workspace" ? "selected" : "")}${button("nav-templates", "templates", view === "templates" ? "selected" : "")}${session ? button("nav-session", "session") : ""}${button("nav-settings", "settings", view === "settings" ? "selected" : "")}</nav></header>` : ""}
    ${testBuild ? `<aside class="preview-banner" role="status">${esc(t("testBuildNotice"))} · ${esc(appVersion)} · ${esc(buildCommit)}</aside>` : ""}
    ${!desktop ? `<aside class="preview-banner">${esc(t("browserPreview"))}</aside>` : ""}
    <div id="update-banner">${view !== "session" && availableUpdate ? button("update-now", "updateNow") : ""}</div>
    <div id="notice" role="${failure ? "alert" : "status"}" class="notice ${failure ? "error" : "success"}" ${message ? "" : "hidden"}>${esc(message)}</div>
    ${view === "workspace" ? workspace.view() : view === "scanner" ? scannerHome() : view === "templates" ? libraryView() : view === "settings" ? settingsView() : sessionView()}
    ${view !== "session" ? `<footer>${button("nav-scanner", "freeScanner")}<span>◉ ${esc(t("localOnly"))}</span><span>${esc(t("localNote"))}</span></footer>` : ""}`;
  click("update-now", updateApp);
  click("nav-workspace", () => navigate("workspace"));
  click("nav-scanner", () =>
    navigate(session?.scanner ? "session" : "scanner"),
  );
  click("start-scanner", () => setupScanner());
  click("import-scanner-home", () => loadScannerJSON());
  click("nav-templates", () => navigate("templates"));
  click("nav-settings", () => navigate("settings"));
  click("nav-session", () => navigate("session"));
  if (view === "session" && !session?.scanner)
    root
      .querySelector(".capture-field.active")
      ?.scrollIntoView({ block: "nearest" });
  if (view === "workspace") workspace.bind(root);
  else if (view === "templates") bindLibrary();
  else if (view === "settings") bindSettings();
  else if (view === "session") bindSession();
}
function emailExample(language: Preferences["language"]): Template {
  const strings = language === "en" ? en : zh;
  const example: Template = {
    id: crypto.randomUUID(),
    name: strings.sampleName,
    folder: strings.sampleFolder,
    placeholderStyle: "braces",
    content: strings.sampleContent,
    fieldOrder: [],
    verificationEnabled: true,
    comparison: structuredClone(defaultPreferences.comparison),
    email: {
      ...structuredClone(defaultEmail),
      enabled: true,
      subject: strings.sampleSubject,
      to: strings.sampleTo,
    },
  };
  example.fieldOrder = orderFields(templateSource(example), [], "braces");
  return example;
}
async function editScannerName(
  index: number,
  adding = false,
): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "scanner-name-title");
  dialog.innerHTML = `<form><h2 id="scanner-name-title">${esc(t(adding ? "addField" : "renameField"))}</h2><label for="scanner-name">${esc(t("scannerFieldName"))}</label><input id="scanner-name" maxlength="250" value="${esc(session!.fields[index].name)}" aria-describedby="scanner-name-error"><p id="scanner-name-error" role="alert"></p><div class="actions"><button type="button" id="cancel-name">${esc(t("keep"))}</button><button type="submit" class="primary">${esc(t("saveFieldName"))}</button></div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  const input = dialog.querySelector<HTMLInputElement>("input")!;
  input.focus();
  input.select();
  dialog.querySelector("form")!.onsubmit = (event) => {
    event.preventDefault();
    try {
      renameScannerField(session!, index, input.value);
      dialog.close("saved");
    } catch {
      dialog.querySelector("[role=alert]")!.textContent = t(
        "scannerFieldInvalid",
      );
      input.focus();
    }
  };
  dialog.querySelector<HTMLButtonElement>("#cancel-name")!.onclick = () =>
    dialog.close("cancel");
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => {
        const saved = dialog.returnValue === "saved";
        dialog.remove();
        resolve(saved);
      },
      { once: true },
    ),
  );
}
async function setupScanner() {
  const input = await formDialog(
    t("freeScanner"),
    [
      { key: "fields", label: t("fieldLines"), lines: true },
      { key: "output", label: t("scannerTemplate"), lines: true },
    ],
    t("startScanner"),
    t("keep"),
    (values) => {
      try {
        fieldNames(
          values.fields.trim()
            ? values.fields
            : scannerTemplateParts(values.output)
                .flatMap((p) => (p.name ? [p.name] : []))
                .filter((n, i, a) => a.indexOf(n) === i)
                .join("\n"),
        );
        return null;
      } catch {
        return t("invalidFields");
      }
    },
  );
  if (!input) return;
  const names = fieldNames(
    input.fields.trim()
      ? input.fields
      : scannerTemplateParts(input.output)
          .flatMap((p) => (p.name ? [p.name] : []))
          .filter((n, i, a) => a.indexOf(n) === i)
          .join("\n"),
  );
  const s = startScanner(library.preferences, t("freeScanner"), names[0]);
  for (const name of names.slice(1)) addScannerField(s, name);
  s.active = 0;
  s.scannerOutputTemplate = input.output;
  await launchScanner(s);
}
async function loadScannerJSON() {
  const json = await platform.importTemplates();
  if (json === null) return;
  const parsed = importScanner(json),
    s = startScanner(
      library.preferences,
      t("freeScanner"),
      parsed.fields[0].name,
    );
  s.fields = parsed.fields.map((f) => ({
    ...f,
    status: f.value === null ? ("empty" as const) : ("captured" as const),
  }));
  s.scannerOutputTemplate = parsed.output;
  s.active = 0;
  await launchScanner(s);
}
async function openRow(table: DataTable, row: DataRow) {
  if (!table.fields.length) throw Error("invalidFields");
  const s = startScanner(library.preferences, table.name, table.fields[0]);
  s.fields = table.fields.map((name) => ({
    name,
    value: Object.hasOwn(row.values, name) ? row.values[name] : null,
    status: !Object.hasOwn(row.values, name) ? "empty" : "captured",
  }));
  s.rowLink = { tableId: table.id, rowId: row.id };
  s.scannerId = row.id;
  s.scannerOutputTemplate = table.output;
  await launchScanner(s);
}
function updateScannerMatches() {
  const s = session;
  if (!s?.scanner) return;
  const parts = scannerTemplateParts(s.scannerOutputTemplate ?? "");
  const target = document.getElementById("scanner-template-match");
  if (target)
    target.innerHTML = parts
      .map((p) =>
        p.name
          ? `<mark class="${s.fields.some((f) => f.name === p.name) ? "matched" : "unmatched"}">${esc(p.text)} <span class="match-label">${esc(t(s.fields.some((f) => f.name === p.name) ? "fieldMatched" : "fieldMissing"))}</span></mark>`
          : esc(p.text),
      )
      .join("");
}
function bindScannerExtras() {
  on("scanner-more", "toggle", (e) => {
    scannerMoreOpen = (e.target as HTMLDetailsElement).open;
  });
  if (!session?.scanner) return;
  updateScannerMatches();
  on("scanner-output-template", "input", (e) => {
    session!.scannerOutputTemplate = (e.target as HTMLTextAreaElement).value;
    updateScannerMatches();
  });
  click("scanner-rename", async () => {
    await editScannerName(session!.active);
    render();
    focus(`field-${session!.active}`);
  });
  click("scanner-import", loadScannerJSON);
  click("scanner-paste", async () => {
    await platform.pasteToSource(scannerValue(session!));
    notify("pasteRequested");
  });
  click("scanner-export-fields", () =>
    platform
      .exportTemplates(exportScanner(session!, false), "veraflow-scanner.json")
      .then(() => {}),
  );
  click("scanner-export-values", async () => {
    if (
      !(await confirmAction(
        "exportValuesConfirm",
        "",
        t("exportScannerValues"),
      ))
    )
      return;
    await platform.exportTemplates(
      exportScanner(session!, true),
      "veraflow-scanner.json",
    );
  });
  click("scanner-add-missing", () => {
    const names = [
      ...new Set(
        scannerTemplateParts(session!.scannerOutputTemplate ?? "").flatMap(
          (p) =>
            p.name && !session!.fields.some((f) => f.name === p.name)
              ? [p.name]
              : [],
        ),
      ),
    ];
    // Validate the whole batch before changing the live session.
    const candidate = structuredClone(session!);
    for (const name of names) addScannerField(candidate, name);
    session = candidate;
    render();
  });
  click("scanner-copy-template", async () => {
    const s = session!;
    const text = scannerTemplateParts(s.scannerOutputTemplate ?? "")
      .map((p) => {
        if (!p.name) return p.text;
        const index = s.fields.findIndex((f) => f.name === p.name);
        if (index < 0) throw Error("missingValue");
        return scannerValue({ ...s, active: index });
      })
      .join("");
    if (!text.trim()) throw Error("noValue");
    await platform.copy(text);
    notify("copied");
  });
  click("scanner-save-row", saveScannerRow);
}
async function saveScannerRow() {
  const s = session!,
    w = structuredClone(library.workspace ?? emptyWorkspace());
  let table = s.rowLink
    ? w.tables.find((t) => t.id === s.rowLink!.tableId)
    : undefined;
  let row = table?.rows.find((r) => r.id === s.rowLink!.rowId);
  if (s.rowLink && (!table || !row)) throw Error("rowMissing");
  if (!table) {
    const input = await formDialog(
      t("saveAsRow"),
      [
        { key: "table", label: t("tableDestination") },
        { key: "title", label: t("rowTitle") },
      ],
      t("saveAsRow"),
      t("keep"),
    );
    if (!input) return;
    if (!input.table.trim()) throw Error("nameRequired");
    const matches = w.tables.filter(
      (t) => t.name === input.table.trim() || t.id === input.table.trim(),
    );
    if (matches.length > 1) throw Error("tableAmbiguous");
    table = matches[0];
    row = rowFromScanner(s, input.title);
    if (table) {
      for (const f of s.fields)
        if (!table.fields.includes(f.name)) table.fields.push(f.name);
      table.rows.push(row);
    } else {
      table = {
        id: veraId(),
        name: input.table.trim(),
        folderId: "",
        fields: s.fields.map((f) => f.name),
        rowTitles: true,
        output: s.scannerOutputTemplate ?? "",
        externalIds: [],
        rows: [],
      };
      table.rows.push(row);
      w.tables.push(table);
    }
  } else {
    // A saved row may add columns, but cannot silently remove other rows' data.
    for (const f of s.fields)
      if (!table.fields.includes(f.name)) table.fields.push(f.name);
    row!.values = rowFromScanner(s).values;
    table.output = s.scannerOutputTemplate ?? "";
  }
  validateWorkspace(w);
  await persist({ ...library, workspace: w });
  s.rowLink = { tableId: table.id, rowId: row!.id };
  s.scannerId = row!.id;
  workspace.select(table.id);
  notify("rowSaved");
}

function scannerHome(): string {
  return `<main class="settings scanner-home"><h1>${esc(t("scanner"))}</h1><p>${esc(t("scannerIntro"))}</p>${button("start-scanner", "defineFields", "primary")}${button("import-scanner-home", "importScanner")}<p class="hint">${esc(t("scannerPrivacy"))}</p></main>`;
}
async function launchScanner(saved?: Session, confirmed = false) {
  if (!(await abandonDraft())) return;
  const template = startScanner(
    library.preferences,
    t("scanner"),
    `${t("scannerField")} 1`,
  ).template;
  if (!(await launch(template, undefined, confirmed))) return;
  if (!session || session.template.id !== "scanner") return;
  session =
    saved ??
    startScanner(library.preferences, t("scanner"), `${t("scannerField")} 1`);
  session.scannerId ??= veraId();
  scannerMoreOpen = false;
  manualOpen = true;
  scannerOutput = "copy";
  render();
  focus(`field-${session.active}`);
}
function scannerControls(): string {
  const s = session!;
  return `<section class="scanner-tools" aria-label="${esc(t("scanner"))}">
    <div class="scanner-bottom-actions"><div class="toolbar">
      ${button("verify-start", "verifyStart")}${button("scanner-copy", "copyField", "primary")}${button("scanner-paste", "pasteToApp", "", !desktop)}
    </div><div class="toolbar">${button("scanner-capture-mode", "scannerNewValue")}${button("scanner-rename", "renameField")}${button("scanner-save-row", s.rowLink ? "saveRow" : "saveAsRow")}</div></div>
    <details id="scanner-more" class="scanner-template-panel" ${scannerMoreOpen ? "open" : ""}><summary>${esc(t("scannerMore"))}</summary><h2>${esc(t("scannerTemplate"))}</h2><label for="scanner-output-template">${esc(t("scannerTemplate"))}</label><textarea id="scanner-output-template" rows="3">${esc(s.scannerOutputTemplate ?? "")}</textarea><div id="scanner-template-match" class="template-match" aria-live="polite"></div><div class="toolbar">${button("scanner-add-missing", "addMissing")}${button("scanner-copy-template", "copyTemplate")}</div><h2>${esc(t("scannerOutput"))}</h2><label for="scanner-output">${esc(t("scannerOutput"))}</label><select id="scanner-output"><option value="copy" ${scannerOutput === "copy" ? "selected" : ""}>${esc(t("copyField"))}</option><option value="paste" ${scannerOutput === "paste" ? "selected" : ""}>${esc(t("pasteField"))}</option><option value="tab" ${scannerOutput === "tab" ? "selected" : ""}>${esc(t("pasteTab"))}</option></select><p class="hint">${esc(t("scannerFocusHelp"))} <kbd>${esc(library.preferences.shortcuts.finish)}</kbd> ${esc(t("mousePasteHelp"))}</p><h2>${esc(t("useTemplate"))}</h2><label for="scanner-template">${esc(t("templates"))}</label><select id="scanner-template">${library.templates.map((tpl) => `<option value="${esc(tpl.id)}">${esc(tpl.name)}</option>`).join("")}</select>${check("scanner-keep", "keepScanner", false)}<p class="hint">${esc(t("scannerMatchHelp"))}</p>${button("scanner-apply", "useTemplate", "", !library.templates.length)}<h2>JSON</h2><div class="toolbar">${button("scanner-import", "importScanner")}${button("scanner-export-fields", "exportScannerFields")}${button("scanner-export-values", "exportScannerValues")}</div><h2>${esc(t("scannerFields"))}</h2><div class="toolbar">${button("clear", "clear")}${button("clean-lines", "removeBlankLines", "", s.fields[s.active]?.value === null)}${button("skip", "skip")}${button("scanner-remove", "removeField", "quiet danger", s.fields.length === 1)}</div></details>
  </section>`;
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
    <div class="template-list">${items.map((item) => `<button class="template-item ${selected === item.id ? "selected" : ""}" data-template="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${esc(item.folder)}${item.folder ? " · " : ""}${captureFieldNames(item).length} ${esc(t("fieldCount"))}</span></button>`).join("") || `<p class="muted">${esc(t(library.templates.length ? "noResults" : "noTemplates"))}</p>`}</div>
    <div class="toolbar template-transfer">${button("import-template", "importTemplate", "", locked)}${button("import-templates", "importTemplates", "", locked)}${button("export-templates", "exportTemplates", "", !library.templates.length)}</div><p class="sidebar-note">${esc(t("workflow"))}</p></aside>
    <main class="editor">${locked ? `<p role="alert">${esc(t("readOnly"))}</p>` : draft ? editorView() : `<div class="empty-state"><p class="eyebrow">${esc(t("library"))}</p><h2>${esc(t("tagline"))}</h2><p>${esc(t("createHint"))}</p>${button("empty-new", "newTemplate", "primary")}</div>`}</main></div>`;
}
function comparisonView(rules: Comparison, prefix: string): string {
  return `<label for="${prefix}-mode">${esc(t("comparison"))}</label><select id="${prefix}-mode"><option value="exact" ${rules.mode === "exact" ? "selected" : ""}>${esc(t("exact"))}</option><option value="whitespace" ${rules.mode === "whitespace" ? "selected" : ""}>${esc(t("whitespace"))}</option></select>
    ${check(prefix + "-case", "caseSensitive", rules.caseSensitive)}${check(prefix + "-unicode", "unicode", rules.unicode)}${check(prefix + "-punctuation", "punctuation", rules.punctuation)}${check(prefix + "-lines", "collapseLines", rules.collapseLines)}<p class="hint">${esc(t("rulesNote"))}</p>`;
}
function editorView(): string {
  const d = draft!;
  return `<div class="section-head"><p class="eyebrow">${esc(t("library"))}</p><div class="toolbar">${button("export-template", "exportTemplate")}${button("duplicate", "duplicate")}${button("delete", "delete", "danger")}</div></div>
  <div class="metadata"> <div>${field("template-name", "name", d.name, 'maxlength="250"')}</div><div>${field("template-folder", "folder", d.folder, 'maxlength="250"')}</div></div>
  <label for="placeholder-style">${esc(t("placeholderStyle"))}</label><select id="placeholder-style"><option value="braces" ${d.placeholderStyle === "braces" ? "selected" : ""}>${esc(t("bracesStyle"))}</option><option value="angle" ${d.placeholderStyle !== "braces" ? "selected" : ""}>${esc(t("angleStyle"))}</option></select><p class="hint">${esc(t("escapeHelp"))}</p>
  ${check("email-enabled", "emailMode", d.email?.enabled ?? false)}
  ${d.email?.enabled ? `<section class="email-template"><p class="hint">${esc(t("emailTemplateHelp"))}</p>${check("email-subject-enabled", "enableSubject", d.email.subjectEnabled !== false)}${d.email.subjectEnabled !== false ? field("email-subject", "subject", d.email.subject) : ""}${field("email-to", "to", d.email.to)}${check("email-cc-enabled", "enableCc", d.email.ccEnabled)}${d.email.ccEnabled ? field("email-cc", "cc", d.email.cc) : ""}${check("email-bcc-enabled", "enableBcc", d.email.bccEnabled)}${d.email.bccEnabled ? field("email-bcc", "bcc", d.email.bcc) : ""}<h2>${esc(t("emailOrder"))}</h2><p class="hint">${esc(t("emailOrderHelp"))}</p><ol class="field-order">${emailOrderView(d)}</ol></section>` : ""}
  <label for="template-content">${esc(t(d.email?.enabled ? "body" : "content"))}</label><textarea id="template-content" class="code template-text" spellcheck="false" aria-describedby="placeholder-help">${esc(d.content)}</textarea><p id="placeholder-help" class="hint">${esc(t(d.placeholderStyle === "braces" ? "bracePlaceholderHelp" : "placeholderHelp"))}</p>
  <label for="extra-scanner-fields">${esc(t("extraScannerFields"))}</label><textarea id="extra-scanner-fields" rows="3" spellcheck="false" aria-describedby="extra-fields-help extra-fields-error">${esc(extraFieldInput ?? (d.extraFields ?? []).join("\n"))}</textarea><p id="extra-fields-help" class="hint">${esc(t("extraFieldsHelp"))}</p><p id="extra-fields-error" role="alert" ${extraFieldsInvalid ? "" : "hidden"}>${extraFieldsInvalid ? esc(t("invalidExtraFields")) : ""}</p>
  <div class="editor-bottom"><section><h2>${esc(t("fields"))}</h2><ol id="field-order" class="field-order">${orderView()}</ol></section><details><summary>${esc(t("templateSettings"))}</summary>${check("template-verify", "verificationEnabled", d.verificationEnabled)}${comparisonView(d.comparison, "template")}</details></div>
  <div class="actions">${button("save", "save")}${button("start", "start", "primary")}</div><p class="hint">${esc(t("keyboardHelp"))}</p>`;
}
function emailOrderView(template: Template): string {
  const parts = emailSections(template).filter((p) => p.key !== "body");
  return (
    parts
      .map(
        (part, index) =>
          `<li><span>${esc(t(part.key))}</span><button id="email-order-${part.key}-up" data-email-key="${part.key}" data-email-move="-1" aria-label="${esc(t("moveUp"))} ${esc(t(part.key))}" ${index === 0 ? "disabled" : ""}>↑</button><button id="email-order-${part.key}-down" data-email-key="${part.key}" data-email-move="1" aria-label="${esc(t("moveDown"))} ${esc(t(part.key))}" ${index === parts.length - 1 ? "disabled" : ""}>↓</button></li>`,
      )
      .join("") + `<li><span>${esc(t("body"))}</span></li>`
  );
}
function orderView(): string {
  const fields = captureFieldNames(draft!);
  return (
    fields
      .map(
        (name, index) =>
          `<li><code>${esc(name)}</code><span><button data-up="${index}" aria-label="${esc(t("moveUp") + " " + name)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-down="${index}" aria-label="${esc(t("moveDown") + " " + name)}" ${index === fields.length - 1 ? "disabled" : ""}>↓</button></span></li>`,
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
          const active = captureFieldNames(draft!);
          const i = Number(el.dataset[direction]),
            j = i + (direction === "up" ? -1 : 1);
          const a = draft!.fieldOrder.indexOf(active[i]),
            b = draft!.fieldOrder.indexOf(active[j]);
          [draft!.fieldOrder[a], draft!.fieldOrder[b]] = [
            draft!.fieldOrder[b],
            draft!.fieldOrder[a],
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
  click("export-templates", async () => {
    await platform.exportTemplates(exportTemplateArchive(library.templates));
  });
  click("export-template", async () => {
    if (!draft?.name.trim()) throw Error("nameRequired");
    if (extraFieldsInvalid) throw Error("invalidExtraFields");
    const json = exportTemplateArchive([draft]);
    parseTemplateArchive(json);
    await platform.exportTemplates(json, "veraflow-template.json");
  });
  click("import-template", () => importTemplates(true));
  click("import-templates", () => importTemplates(false));
  async function importTemplates(single: boolean) {
    if (!(await abandonDraft())) return;
    if (selected) selectTemplate(selected);
    render();
    const json = await platform.importTemplates();
    if (json === null) return;
    const imported = parseTemplateArchive(json);
    if (single && imported.length !== 1) throw Error("singleTemplateRequired");
    if (library.templates.length + imported.length > 1000)
      throw Error("invalidImport");
    if (
      !(await confirmAction(
        "importConfirm",
        imported
          .map((t) => t.name)
          .slice(0, 10)
          .join("\n") + (imported.length > 10 ? "\n…" : ""),
      ))
    )
      return;
    const copies = imported.map((t) => ({ ...t, id: crypto.randomUUID() }));
    await persist({ ...library, templates: [...library.templates, ...copies] });
    selectTemplate(copies[0].id);
    notify("imported");
  }
  on("placeholder-style", "change", (e) => {
    draft!.placeholderStyle = (e.target as HTMLSelectElement).value as
      "angle" | "braces";
    draft!.fieldOrder = rememberedFieldOrder(draft!);
    dirty = true;
    render();
    focus("placeholder-style");
  });
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
  on("extra-scanner-fields", "input", (e) => {
    const names = [
      ...new Set(
        (e.target as HTMLTextAreaElement).value
          .split(/\r?\n/)
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    ];
    extraFieldInput = (e.target as HTMLTextAreaElement).value;
    dirty = true;
    try {
      validateExtraFields(names);
      extraFieldsInvalid = false;
      document.getElementById("extra-fields-error")!.hidden = true;
      if (names.length) draft!.extraFields = names;
      else delete draft!.extraFields;
      document.getElementById("extra-fields-error")!.textContent = "";
      draft!.fieldOrder = rememberedFieldOrder(draft!);
      document.getElementById("field-order")!.innerHTML = orderView();
      bindOrder();
    } catch {
      extraFieldsInvalid = true;
      document.getElementById("extra-fields-error")!.hidden = false;
      document.getElementById("extra-fields-error")!.textContent =
        t("invalidExtraFields");
    }
  });
  on("template-content", "input", (e) => {
    draft!.content = (e.target as HTMLTextAreaElement).value;
    draft!.fieldOrder = rememberedFieldOrder(draft!);
    dirty = true;
    document.getElementById("field-order")!.innerHTML = orderView();
    bindOrder();
  });
  on("template-verify", "change", (e) => {
    draft!.verificationEnabled = (e.target as HTMLInputElement).checked;
    dirty = true;
  });
  for (const [id, key] of [
    ["email-enabled", "enabled"],
    ["email-subject-enabled", "subjectEnabled"],
    ["email-cc-enabled", "ccEnabled"],
    ["email-bcc-enabled", "bccEnabled"],
  ] as const) {
    on(id, "change", (e) => {
      draft!.email ??= structuredClone(defaultEmail);
      draft!.email[key] = (e.target as HTMLInputElement).checked;
      draft!.fieldOrder = rememberedFieldOrder(draft!);
      dirty = true;
      render();
      focus(id);
    });
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-email-move]")
    .forEach((el) => {
      el.onclick = () =>
        void run(() => {
          const parts = emailSections(draft!)
            .filter((p) => p.key !== "body")
            .map((p) => p.key);
          const index = parts.indexOf(
            el.dataset.emailKey as (typeof parts)[number],
          );
          const other = parts[index + Number(el.dataset.emailMove)];
          if (!other || index < 0) return;
          const order = [
            ...new Set([
              ...(draft!.email!.order ?? defaultEmailOrder),
              ...defaultEmailOrder,
            ]),
          ];
          const a = order.indexOf(parts[index] as (typeof order)[number]),
            b = order.indexOf(other as (typeof order)[number]);
          [order[a], order[b]] = [order[b], order[a]];
          draft!.email!.order = order;
          dirty = true;
          render();
          const desired = document.querySelector<HTMLButtonElement>(
            `[data-email-key="${el.dataset.emailKey}"][data-email-move="${el.dataset.emailMove}"]`,
          );
          focus(
            desired && !desired.disabled
              ? desired.id
              : `email-order-${el.dataset.emailKey}-${Number(el.dataset.emailMove) === -1 ? "down" : "up"}`,
          );
        });
    });
  for (const key of ["subject", "to", "cc", "bcc"] as const)
    on("email-" + key, "input", (e) => {
      draft!.email![key] = (e.target as HTMLInputElement).value;
      draft!.fieldOrder = rememberedFieldOrder(draft!);
      dirty = true;
      document.getElementById("field-order")!.innerHTML = orderView();
      bindOrder();
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
  extraFieldInput = null;
  extraFieldsInvalid = false;
  selected = id;
  draft = structuredClone(
    library.templates.find((item) => item.id === id) ?? null,
  );
  if (draft) draft.fieldOrder = rememberedFieldOrder(draft);
  dirty = false;
}
async function newTemplate() {
  if (!(await abandonDraft())) return;
  extraFieldInput = null;
  extraFieldsInvalid = false;
  draft = {
    id: crypto.randomUUID(),
    name: t("untitled"),
    placeholderStyle: "braces",
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
  if (extraFieldsInvalid) throw Error("invalidExtraFields");
  validateExtraFields(draft.extraFields);
  const saved = structuredClone(draft);
  saved.name = saved.name.trim();
  await persist({
    ...library,
    templates: library.templates.some((item) => item.id === saved.id)
      ? library.templates.map((item) => (item.id === saved.id ? saved : item))
      : [...library.templates, saved],
  });
  draft = structuredClone(saved);
  extraFieldInput = null;
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
  <section><h2>${esc(t("verification"))}</h2>${check("verificationDefault", "verificationDefault", p.verificationDefault)}${check("verifiedBackground", "verifiedBackground", p.verifiedBackground)}${comparisonView(p.comparison, "default")}</section>
  <section><h2>${esc(t("privacy"))}</h2>${check("clearAfterCompletion", "clearAfterCompletion", p.clearAfterCompletion)}${check("restoreClipboard", "restoreClipboard", p.restoreClipboard)}<p class="hint">${esc(t("clipboardDefaultHelp"))}</p><p class="hint">${esc(t("quitPrivacy"))}</p></section>
  <section><h2>${esc(t("shortcuts"))}</h2><p class="hint">${esc(t("keyboardHelp"))}</p><p class="hint">${esc(t("shortcutHelp"))}</p>${check("globalShortcuts", "globalShortcuts", p.globalShortcuts)}${button("alternate-shortcuts", "alternateShortcuts")}${actions.map((action) => field("key-" + action, action === "cancel" ? "cancelSession" : action, p.shortcuts[action], 'class="shortcut-input"')).join("")}</section></div><div class="actions">${button("save-settings", "saveSettings", "primary", locked)}</div><section class="about" aria-labelledby="about-heading"><h2 id="about-heading">${esc(t("about"))}</h2><p>${esc(t("copyright"))}</p><div class="actions">${button("update-app", "updateApp")}</div><p class="hint">${esc(t("updateHelp"))}</p><a id="repository-link" href="https://github.com/iandorsey00/veraflow" target="_blank" rel="noopener noreferrer">${esc(t("repository"))}</a></section></main>`;
}
async function checkAvailableUpdate() {
  if (updateCheck) return updateCheck;
  updateCheck = (async () => {
    availableUpdate = await platform.checkUpdate();
    const banner = document.getElementById("update-banner");
    if (banner && view !== "session") {
      banner.innerHTML = availableUpdate
        ? button("update-now", "updateNow")
        : "";
      click("update-now", updateApp);
      click("nav-workspace", () => navigate("workspace"));
    }
    return availableUpdate;
  })();
  try {
    return await updateCheck;
  } finally {
    updateCheck = null;
  }
}
async function updateApp() {
  if (testBuild) throw Error("testBuildUpdates");
  if (dirty || privateWork()) throw Error("updateBusy");
  notify("updateChecking");
  const update = await checkAvailableUpdate();
  if (!update) {
    notify("updateCurrent");
    return;
  }
  if (
    !(await confirmAction(
      "updateConfirm",
      `VeraFlow ${update.version}\n\n${update.notes}`,
    ))
  ) {
    message = "";
    render();
    return;
  }
  if (dirty || privateWork()) throw Error("updateBusy");
  notify("updateDownloading");
  let lastProgress = 0;
  await platform.installUpdate((event) => {
    if (event.stage === "installing") {
      notify("updateInstalling");
      return;
    }
    if (Date.now() - lastProgress < 200) return;
    lastProgress = Date.now();
    message = t("updateDownloading");
    if (event.total && event.downloaded !== undefined)
      message += ` ${Math.min(100, Math.floor((event.downloaded / event.total) * 100))}%`;
    failure = false;
    render();
  });
}
function bindSettings() {
  click("update-app", updateApp);
  click("alternate-shortcuts", () => {
    actions.forEach((action, index) => {
      settingsDraft!.shortcuts[action] =
        `CommandOrControl+Alt+Shift+${index + 1}`;
    });
    dirty = true;
    render();
    focus("save-settings");
  });
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
    "globalShortcuts",
    "verificationDefault",
    "verifiedBackground",
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
    const enabled = Object.values(p.shortcuts).filter((s) => s.trim());
    if (
      p.globalShortcuts &&
      new Set(enabled.map((s) => s.toLowerCase())).size !== enabled.length
    )
      throw Error("shortcutFailed");
    await bindShortcuts(p.globalShortcuts ? p.shortcuts : null, dispatch);
    try {
      await platform.autostart(p.launchAtLogin);
      await persist({ ...library, preferences: structuredClone(p) });
    } catch (error) {
      await bindShortcuts(
        old.globalShortcuts && session && session.mode !== "complete"
          ? old.shortcuts
          : null,
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
async function launch(
  template: Template,
  scannerSource?: Session,
  confirmed = false,
) {
  if (
    ((session && session.mode !== "complete") || retainedScanner) &&
    !scannerSource &&
    !confirmed &&
    !(await confirmAction("sessionConfirm"))
  )
    return false;
  if (
    template.email?.enabled &&
    ((template.email.subjectEnabled !== false &&
      !template.email.subject.trim()) ||
      !template.email.to.trim())
  )
    throw new Error("emailRequired");
  let shortcutError: unknown;
  try {
    await bindShortcuts(
      library.preferences.globalShortcuts
        ? library.preferences.shortcuts
        : null,
      dispatch,
    );
  } catch (error) {
    await bindShortcuts(null, dispatch);
    shortcutError = error;
  }
  const nextSession = scannerSource
    ? applyScanner(scannerSource, template)
    : startSession(template);
  await platform.mouseSource(false);
  await platform.active(true);
  await platform.compact(true, library.preferences.alwaysOnTop);
  if (session) eraseSession(session);
  session = nextSession;
  if (!scannerSource) {
    eraseRetainedScanner();
    returnToScanner = false;
  }
  manualOpen = false;
  sessionOptionsOpen = false;
  mouseMode = true;
  preserveClipboard = library.preferences.restoreClipboard;
  view = "session";
  preview = false;
  message = "";
  render();
  focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
  if (shortcutError) report(shortcutError);
  return true;
}
function sessionView(): string {
  if (!session) return "";
  const s = session,
    p = library.preferences,
    f = s.fields[s.active];
  if (s.mode === "review")
    return `<main class="capture-panel"><h1>✓ ${esc(t(s.template.email?.enabled ? "emailDone" : "complete"))}</h1><p>${esc(t(s.template.email?.enabled ? "emailReviewHelp" : "extraFieldsReviewHelp"))}</p><div class="actions">${button("email-to-scanner", "emailToScanner", "primary")}${button("email-clear-close", "clearClose", "danger")}</div></main>`;
  if (s.mode === "complete")
    return `<main class="capture-panel"><p class="eyebrow">${esc(t("app"))}</p><h1>✓ ${esc(t(s.template.email?.enabled ? "emailDone" : "complete"))}</h1><p>${esc(t(s.template.email?.enabled ? "emailFinished" : "copied"))}</p><p class="muted">${esc(t(p.clearAfterCompletion ? "erased" : "retained"))}</p>${button("close-session", returnToScanner ? "returnScanner" : "closeSession", "primary")}</main>`;
  if (s.mode === "delivery") {
    const parts = renderEmail(s),
      index = s.deliveryIndex ?? 0;
    return `<main class="capture-panel"><h1>${esc(t("emailDelivery"))}</h1><p class="hint">${esc(t("emailDeliveryHelp"))}</p><p role="status">${esc(t(parts[index].key))} · ${index + 1}/${parts.length}</p><pre class="output">${esc(parts[index].text)}</pre><p><kbd>${esc(p.shortcuts.finish)}</kbd> ${esc(t("emailPasteNext"))}</p><p><kbd>${esc(p.shortcuts.previous)}</kbd> ${esc(t("emailGoBack"))}</p><p class="hint">${esc(t("emailBackHelp"))}</p>${s.deliveryDone ? `<p role="status">${esc(t("emailBodyPasted"))}</p>` : ""}<div class="actions">${button("email-copy", "emailCopy")}${button("email-back", "emailManualBack", "", index === 0)}${button("email-next", "emailManualNext", "", !!s.deliveryDone)}${button("email-done", "emailDone", "primary", !s.deliveryDone)}${button("cancel-session", s.scanner ? "endScanner" : "cancelSession", "quiet danger")}</div></main>`;
  }
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
      rendered = s.template.email?.enabled
        ? renderEmail(s)
            .map((p) => `${t(p.key)}: ${p.text}`)
            .join("\n\n")
        : renderSession(s);
    } catch {
      preview = false;
    }
  }
  return `<main class="capture-panel ${s.scanner ? "scanner-panel" : ""}"><div class="section-head session-heading"><h1>${esc(s.scanner ? t("scanner") : s.template.name)}</h1>${button("session-back", s.scanner ? "workspace" : "templates")}</div><p class="eyebrow" role="status">${esc(t(s.mode))} · ${done}/${s.fields.length}</p>
  ${s.scanner ? `<p class="vera-id">${esc(s.rowLink?.rowId ?? s.scannerId)}${s.rowLink ? `<br>${esc(s.rowLink.tableId)}` : ""}</p><p class="hint">${esc(t(s.rowLink ? "rowSaveHelp" : "scannerTemporary"))}</p>` : ""}
  ${s.mode !== "ready" && f ? `<details id="manual-entry" ${manualOpen ? "open" : ""}><summary>${esc(t("manualEntry"))}</summary><form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label><textarea id="manual-value" rows="2" spellcheck="false"></textarea><div class="toolbar">${button("apply-value", mode === "verify" ? "compare" : "apply", "primary")}${button("use-clipboard", "clipboard")}</div></form>${!s.scanner ? `<p class="hint">${esc(t("clipboardHelp"))}</p>` : ""}</details>` : ""}
  ${mouseMode ? `<div class="toolbar">${button("mouse-back", "previous")}${button("mouse-transfer", "transfer", "primary", s.mode === "ready")}${button("mouse-forward", "next")}</div>` : ""}
  <details id="session-options" class="session-options" ${sessionOptionsOpen ? "open" : ""}><summary>${esc(t("sessionOptions"))}</summary><p class="hint">${esc(t(mode === "verify" ? "verifyHelp" : "captureHelp"))}</p><kbd>${esc(p.shortcuts[mode])}</kbd>
  ${s.mode !== "ready" ? check("preserve-clipboard", "preserveClipboard", preserveClipboard) + `<p class="hint">${esc(t("preserveClipboardHelp"))}</p>` : ""}
  ${check("mouse-mode", "mouseMode", mouseMode)}<p class="hint">${esc(t("mouseHelp"))}</p></details>
  ${s.scanner ? `<div class="section-head scanner-field-heading"><h2>${esc(t("scannerFields"))}</h2>${button("scanner-add", "addField")}</div><p class="hint">${esc(t("scannerFieldsHelp"))}</p>` : ""}
  <ol class="capture-fields" aria-label="${esc(t("fields"))}">${s.fields.map((field, index) => `<li><button id="field-${index}" data-field="${index}" class="capture-field ${p.verifiedBackground && field.status === "verified" ? "verified-background" : ""} ${index === s.active ? "active" : ""} ${field.status}" ${index === s.active ? 'aria-current="step"' : ""}><span class="state-icon" aria-hidden="true">${index === s.active ? "→" : symbols[field.status]}</span><span class="field-body"><strong>${esc(field.name)}</strong><span class="field-value">${esc(field.value ?? "—")}</span></span><span class="status-label">${esc(t(field.status))}</span></button></li>`).join("")}</ol>
  ${f ? `<details class="inspect"><summary>${esc(t("expand"))}: ${esc(f.name)}</summary><pre>${esc(f.value ?? "—")}</pre></details>` : ""}
  ${f?.removeBlankLines ? `<p class="hint">${esc(t("blankLinesRemoved"))}</p>` : ""}
  ${f?.status === "mismatch" ? mismatchView(f.value!, f.candidate!) : ""}

  ${!s.scanner ? `<div class="toolbar navigation">${button("previous", "previous")}${button("next", "next")}${button("clear", "clear")}${button("clean-lines", "removeBlankLines", "", !f || f.value === null)}${button("skip", "skip")}</div>` : ""}
  ${s.scanner ? scannerControls() : s.mode === "ready" ? `<div class="actions">${button("preview", "preview")}${button("finish", s.template.email?.enabled ? "emailPrepare" : "finish", "primary")}</div>` : `<div class="actions">${button("verify-start", "verifyStart")}${!s.template.verificationEnabled ? button("finish", s.template.email?.enabled ? "emailPrepare" : "finish", "primary") : ""}</div>`}
  ${preview ? `<pre class="output">${esc(rendered)}</pre>` : ""}
  <details><summary>${esc(t("help"))}</summary><dl class="shortcut-list">${actions.map((a) => `<dt>${esc(t(a === "cancel" ? "cancelSession" : a))}</dt><dd><kbd>${esc(p.shortcuts[a])}</kbd></dd>`).join("")}</dl></details>
  <div class="actions">${button("cancel-session", s.scanner ? "endScanner" : "cancelSession", "quiet danger")}</div></main>`;
}
function mismatchView(a: string, b: string): string {
  const diff = difference(a, b);
  return `<section class="mismatch-box" role="alert"><h2>! ${esc(t("mismatch"))}</h2><p>${esc(t("mismatchHelp"))}</p>${diff.map((part, index) => `<h3>${esc(t(index ? "selectedValue" : "capturedValue"))}</h3><pre>${esc(part.before)}<mark>${esc(part.middle) || "∅"}</mark>${esc(part.after)}</pre>`).join("")}${button("correct-value", "editValue")}</section>`;
}
function scannerFieldMenu(index: number, x: number, y: number) {
  session!.active = index;
  render();
  const menu = document.createElement("dialog");
  menu.className = "field-context-menu";
  menu.setAttribute("aria-label", t("scannerFields"));
  menu.innerHTML = [
    ["scanner-copy", "copyField"],
    ["scanner-paste", "pasteToApp"],
    ["verify-start", "verifyStart"],
    ["scanner-rename", "renameField"],
  ]
    .map(
      ([id, label]) =>
        `<button data-context="${id}" ${id === "scanner-paste" && !desktop ? "disabled" : ""}>${esc(t(label as Key))}</button>`,
    )
    .join("");
  document.body.append(menu);
  menu.showModal();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener(
    "close",
    () => {
      menu.remove();
      focus(`field-${index}`);
    },
    { once: true },
  );
  menu.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-context]",
    )?.dataset.context;
    if (action) {
      menu.close();
      document.getElementById(action)?.click();
    } else if (e.target === menu) menu.close();
  });
}
function bindSession() {
  bindScannerExtras();
  if (session?.scanner)
    root.querySelectorAll<HTMLButtonElement>("[data-field]").forEach((el) => {
      el.oncontextmenu = (event) => {
        if (window.getSelection()?.toString()) return;
        event.preventDefault();
        if (!busy)
          scannerFieldMenu(
            Number(el.dataset.field),
            event.clientX,
            event.clientY,
          );
      };
    });
  click("scanner-remove", async () => {
    const s = session!;
    if (s.fields.length <= 1) return;
    if (
      s.fields[s.active].value !== null &&
      !(await confirmAction("removeFieldConfirm"))
    )
      return;
    clear(s);
    s.fields.splice(s.active, 1);
    s.active = Math.min(s.active, s.fields.length - 1);
    render();
  });
  click("scanner-add", async () => {
    let number = session!.fields.length + 1;
    while (
      session!.fields.some((f) => f.name === `${t("scannerField")} ${number}`)
    )
      number++;
    const oldActive = session!.active,
      oldMode = session!.mode;
    addScannerField(session!, `${t("scannerField")} ${number}`);
    if (!(await editScannerName(session!.active, true))) {
      session!.fields.pop();
      session!.active = oldActive;
      session!.mode = oldMode;
    }
    render();
    focus(`field-${session!.active}`);
  });
  click("scanner-capture-mode", () => {
    session!.mode = "capture";
    manualOpen = true;
    render();
    focus("manual-value");
  });
  click("scanner-copy", async () => {
    await platform.copy(scannerValue(session!));
    notify("copied");
  });
  on("scanner-output", "change", (e) => {
    scannerOutput = (e.target as HTMLSelectElement)
      .value as typeof scannerOutput;
  });
  click("scanner-apply", async () => {
    const template = library.templates.find(
      (t) =>
        t.id ===
        (document.getElementById("scanner-template") as HTMLSelectElement)
          .value,
    );
    if (!template || !session?.scanner) return;
    const source = structuredClone(session);
    const keep = (document.getElementById("scanner-keep") as HTMLInputElement)
      .checked;
    if (!(await launch(template, source))) return;
    returnToScanner = true;
    eraseRetainedScanner();
    if (keep) retainedScanner = source;
    else eraseSession(source);
  });
  on("mouse-mode", "change", (e) => {
    mouseMode = (e.target as HTMLInputElement).checked;
    render();
    focus("mouse-mode");
  });
  click("mouse-transfer", async () => {
    if (!session || !["capture", "verify"].includes(session.mode)) return;
    await accept(await platform.mouseTransfer(preserveClipboard));
  });
  click("mouse-back", () => perform("previous"));
  click("mouse-forward", () => perform("next"));
  on("preserve-clipboard", "change", (e) => {
    preserveClipboard = (e.target as HTMLInputElement).checked;
    message = "";
    render();
  });
  click("email-back", () => perform("previous"));
  click("email-next", () => perform("next"));
  click("email-copy", async () => {
    await platform.copy(
      renderEmail(session!)[session!.deliveryIndex ?? 0].text,
    );
  });
  click("email-done", async () => {
    if (!session?.deliveryDone) return;
    session.mode = "review";
    await bindShortcuts(null, dispatch);
    await platform.active(true);
    await platform.compact(false, false);
    render();
    focus("email-to-scanner");
  });
  click("email-to-scanner", async () => {
    if (session?.mode !== "review") return;
    const fields = completedFieldsToScanner(
      session,
      library.preferences,
      t("scanner"),
      `${t("scannerField")} 1`,
    );
    await launchScanner(fields, true);
  });
  click("email-clear-close", async () => {
    eraseRetainedScanner();
    returnToScanner = false;
    await closeSession();
  });
  click("session-back", () =>
    navigate(session?.scanner ? "workspace" : "templates"),
  );
  click("close-session", closeSession);
  root.querySelectorAll<HTMLButtonElement>("[data-field]").forEach(
    (el) =>
      (el.onclick = () =>
        void run(() => {
          session!.active = Number(el.dataset.field);
          if (session!.scanner) session!.mode = "capture";
          preview = false;
          render();
          root
            .querySelector<HTMLButtonElement>(
              `[data-field="${session!.active}"]`,
            )
            ?.focus();
        })),
  );
  on("session-options", "toggle", (e) => {
    sessionOptionsOpen = (e.target as HTMLDetailsElement).open;
  });
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
    if (session!.scanner) {
      if (session!.fields[session!.active].value === null)
        throw Error("noValue");
      session!.mode = "verify";
    } else beginVerification(session!);
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
  click("clean-lines", () => {
    cleanBlankLines(session!);
    if (session!.scanner) session!.mode = "capture";
    preview = false;
    message = "";
    render();
    focus(`field-${session!.active}`);
  });
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
async function accept(
  value: string,
  advance = library.preferences.autoAdvance,
) {
  if (!session) return;
  if (value.length > 1024 * 1024) throw new Error("invalidText");
  if (session.mode === "verify")
    verify(session, value, session.scanner ? false : advance);
  else if (session.scanner) captureScanner(session, value, advance);
  else capture(session, value, advance);
  if (session.scanner && session.mode === "ready") session.mode = "capture";
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
  void run(() => perform(action, true));
}
async function perform(action: Action, global = false) {
  const s = session;
  if (!s || s.mode === "complete") return;
  // Global navigation is frozen while an editor/settings screen or confirmation is open.
  if (view !== "session") return;
  if (s.mode === "review") return;
  if (s.mode === "delivery" && action !== "cancel") {
    if (!global && (action === "previous" || action === "next")) {
      moveEmailSection(s, action === "previous" ? -1 : 1);
    } else if (global && action === "next") {
      moveEmailSection(s, 1);
    } else if (global && (action === "previous" || action === "finish")) {
      await deliverEmailSection(s, action === "previous", platform.deliver);
    } else return;
    message = "";
    render();
    return;
  }
  switch (action) {
    case "capture":
      if (s.mode === "verify")
        await accept(await platform.capture(preserveClipboard), true);
      else if (s.mode !== "ready")
        await accept(await platform.capture(preserveClipboard), true);
      return;
    case "verify":
      if (s.scanner && s.mode !== "verify") {
        if (s.fields[s.active].value === null) throw Error("noValue");
        s.mode = "verify";
        break;
      }
      if (s.mode === "capture") {
        beginVerification(s);
        break;
      }
      if (s.mode === "verify")
        await accept(await platform.capture(preserveClipboard), true);
      return;
    case "previous":
      move(s, -1);
      if (s.scanner) s.mode = "capture";
      break;
    case "next":
      move(s, 1);
      if (s.scanner) s.mode = "capture";
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
      skip(s, s.scanner ? false : library.preferences.autoAdvance);
      break;
    case "cancel":
      if (await confirmAction("sessionConfirm")) await closeSession();
      return;
    case "finish": {
      if (s.scanner) {
        const value = scannerValue(s);
        if (scannerOutput === "copy") await platform.copy(value);
        else if (!global) throw Error("scannerFocusHelp");
        else await platform.deliver(value, scannerOutput === "tab");
        if (library.preferences.autoAdvance && s.fields.length > 1) move(s, 1);
        s.mode = "capture";
        render();
        return;
      }
      if (s.template.email?.enabled) {
        renderEmail(s);
        s.mode = "delivery";
        s.deliveryIndex = 0;
        s.deliveryDone = false;
        render();
        return;
      }
      const output = renderSession(s);
      await platform.copy(output);
      if (s.template.extraFields?.length) s.mode = "review";
      else if (library.preferences.clearAfterCompletion) eraseSession(s);
      else s.mode = "complete";
      preview = false;
      await bindShortcuts(null, dispatch);
      await platform.active(s.mode === "review");
      await platform.compact(false, false);
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
  const wasScanner = session?.scanner;
  if (session) eraseSession(session);
  session = null;
  await bindShortcuts(null, dispatch);
  await platform.active(false);
  if (returnToScanner) {
    const saved = retainedScanner;
    retainedScanner = null;
    returnToScanner = false;
    try {
      await launchScanner(saved ?? undefined);
    } catch (error) {
      retainedScanner = saved;
      returnToScanner = true;
      throw error;
    }
  } else await navigate(wasScanner ? "workspace" : "templates");
}
async function confirmAction(
  key: Key,
  detail = "",
  actionText?: string,
): Promise<boolean> {
  await platform.reveal();
  const prior = document.activeElement as HTMLElement | null;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "confirmation-title");
  const labels: Partial<Record<Key, Key>> = {
    deleteConfirm: "delete",
    discardConfirm: "discardChanges",
    sessionConfirm: "eraseSession",
    quitConfirm: "quit",
    skipConfirm: "clearAndSkip",
    removeFieldConfirm: "removeField",
    importConfirm: "importTemplates",
    updateConfirm: "updateNow",
  };
  const action = labels[key] ?? "confirm";
  dialog.innerHTML = `<form method="dialog"><h2 id="confirmation-title">${esc(t(key))}</h2>${detail ? `<pre>${esc(detail)}</pre>` : ""}<div class="actions"><button value="no" autofocus>${esc(t("keep"))}</button><button value="yes" class="${["deleteConfirm", "discardConfirm", "sessionConfirm", "quitConfirm", "skipConfirm", "removeFieldConfirm"].includes(key) ? "danger" : "primary"}">${esc(actionText ?? t(action))}</button></div></form>`;
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
    event.repeat ||
    event.isComposing ||
    busy ||
    document.querySelector("dialog[open]")
  )
    return;
  if (view === "session" && session?.scanner) {
    const target = event.target as HTMLElement;
    const fieldButton = target.closest<HTMLButtonElement>("[data-field]");
    if (
      fieldButton &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "c" &&
      !window.getSelection()?.toString()
    ) {
      event.preventDefault();
      void run(async () => {
        await platform.copy(
          scannerValue({
            ...session!,
            active: Number(fieldButton.dataset.field),
          }),
        );
        notify("copied");
      });
      return;
    }
    if (
      fieldButton &&
      event.key === "Tab" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const next =
        Number(fieldButton.dataset.field) + (event.shiftKey ? -1 : 1);
      if (next >= 0 && next < session.fields.length) {
        event.preventDefault();
        session.active = next;
        session.mode = "capture";
        render();
        focus(`field-${next}`);
      }
      return;
    }
  }
  if (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key === "Enter"
  ) {
    event.preventDefault();
    if (view === "scanner") document.getElementById("start-scanner")?.click();
    else if (view === "templates") document.getElementById("start")?.click();
    else if (view === "session" && session?.mode === "review")
      document.getElementById("email-to-scanner")?.click();
    else if (view === "session" && session?.mode === "delivery")
      document.getElementById("email-done")?.click();
    else if (
      view === "session" &&
      session?.mode !== "ready" &&
      session?.mode !== "complete"
    ) {
      if (!manualOpen) {
        manualOpen = true;
        render();
        focus("manual-value");
      } else {
        const value = (
          document.getElementById("manual-value") as HTMLTextAreaElement
        ).value;
        void run(() => accept(value, true));
      }
    }
  }
  if (
    view === "session" &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    void run(() => perform(event.key === "ArrowLeft" ? "previous" : "next"));
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty || privateWork()) {
    event.preventDefault();
  }
});
async function init() {
  try {
    const saved = await platform.load();
    if (saved) {
      if (saved.workspace) validateWorkspace(saved.workspace);
      library = saved;
      const clipboardChanged = migrateClipboardPreference(library);
      const shortcutsChanged = migrateShortcutDefaults(library);
      if (clipboardChanged || shortcutsChanged) await persist(library);
    } else {
      library.templates = [emailExample("en"), emailExample("zh-CN")];
    }
  } catch (error) {
    locked = true;
    report(error);
  }
  if (library.templates[0]) selectTemplate(library.templates[0].id);
  render();
  if (desktop && !testBuild)
    void checkAvailableUpdate().catch(() => {
      /* Settings offers a retry. */
    });
  await platform.tray(
    (action) =>
      void run(async () => {
        if (action === "quit") {
          if (
            (privateWork() || dirty) &&
            !(await confirmAction(session ? "quitConfirm" : "discardConfirm"))
          )
            return;
          if (session) eraseSession(session);
          eraseRetainedScanner();
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
