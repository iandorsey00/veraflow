import { textLayoutError } from "./core/form";
import {
  parseSource,
  SourceSyntaxError,
  prefillSource,
  sourceDefinitionText,
  type DeliveryMode,
} from "./core/source";
import { parseCSV, csvTable } from "./core/csv";
import { sessionProgress } from "./core/progress";
import { bindReorder } from "./reorder";
import { workspaceUI, formDialog, type Input } from "./workspace-ui";
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
  defaultOutputHistoryLimit,
  maxOutputHistoryLimit,
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
  templateControls,
  validateExtraFields,
} from "./core/template";
import { orderFields } from "./core/template";
import { difference } from "./core/compare";
import {
  startSession,
  prepareWorkflow,
  activeSourceFields,
  prepareSections,
  fieldVisible,
  previewSections,
  verificationRequired,
  capture,
  verify,
  move,
  clear,
  skip,
  beginVerification,
  beginReverification,
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
  type OpenDocument,
  type RecentDocument,
  type OutputLabel,
} from "./platform";

type Key = keyof typeof en;
const root = document.querySelector<HTMLDivElement>("#app")!;
let library: Library = {
  version: 1,
  templates: [],
  preferences: structuredClone(defaultPreferences),
};
let view:
  | "recent"
  | "outputs"
  | "workspace"
  | "scanner"
  | "templates"
  | "settings"
  | "session" = "recent";
let recentDocuments: RecentDocument[] = [];
let outputLabels: OutputLabel[] = [];
let selectedOutput: { index: number; text: string } | null = null;
let recordedOutputs = new WeakSet<Session>();
const historyLimit = (p = library.preferences) =>
  p.outputHistoryLimit ?? defaultOutputHistoryLimit;
let selected = "",
  draft: Template | null = null,
  settingsDraft: Preferences | null = null,
  session: Session | null = null;
// Browser fixture links can open either layout directly.
const layoutOverride = !desktop
  ? new URLSearchParams(location.search).get("workflow")
  : null;
let focusedWorkflow = layoutOverride === "focused";
let typingCheck = false;
let groupSections = false;
let sectionTab = false;
let deliveryMode: DeliveryMode = "step";
let lastTemplate: { definition: Template; typing: boolean } | null = null;
let paused = false;
let templateForm = false;
let templateEditorOpen = false;
let taskGeneration = 0;
const manualDrafts = new Map<string, string>();
let lastStep: { key: Key; name: string } | null = null;
const emailSteps = new Map<string, Key>();
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
  copied: () => notify("copied"),
  pasted: () => notify("pasteRequested"),
  confirm: (detail, action) =>
    confirmAction("workspaceConfirm", detail, action),
});
function privateWork() {
  return (
    !!document.querySelector("dialog[open]") ||
    !!retainedScanner ||
    (!!session && session.mode !== "complete")
  );
}
function eraseRetainedScanner() {
  if (retainedScanner) eraseSession(retainedScanner);
  retainedScanner = null;
}
let pendingFocus: string | null = null;
let manualOpen = false;
let sessionOptionsOpen = false;
let scannerMoreOpen = false;
let taskToolsOpen = false;
let scannerReordering = false;
let reverification: "field" | "all" | null = null;
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
    (mouseMode &&
      view === "session" &&
      !paused &&
      !templateFormActive() &&
      !!session &&
      ["capture", "verify"].includes(session.mode)) ||
    (view === "workspace" && workspace.hasSnippets());
  if (!enabled && !watchingSource) return;
  mousePolling = true;
  try {
    watchingSource = enabled;
    const available = await platform.mouseSource(enabled);
    const transfer = document.getElementById(
      "mouse-transfer",
    ) as HTMLButtonElement | null;
    if (transfer) transfer.disabled = busy || !available;
    root
      .querySelectorAll<HTMLButtonElement>('[data-snippet-action="paste"]')
      .forEach((button) => {
        button.disabled = busy || !available;
      });
  } catch {
    /* Transfer reports an actionable error when requested. */
  } finally {
    mousePolling = false;
  }
}, 250);
let quitting = false;
let documentsPending = false;
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
function errorText(error: unknown) {
  if (error instanceof SourceSyntaxError)
    return error.line
      ? `${t("sourceLine")} ${error.line} · ${error.detail}`
      : error.detail;
  return tr(error instanceof Error ? error.message : String(error));
}
function report(error: unknown) {
  message =
    error instanceof ShortcutBindingError
      ? `${t("shortcutFailed")} ${t(error.action === "cancel" ? "cancelSession" : error.action)}: ${error.shortcut}`
      : error instanceof EmailHeaderError
        ? `${t(error.section)}: ${t("emailHeaderInvalid")}`
        : errorText(error);
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
    if (documentsPending && !quitting) void drainDocuments();
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
  root.oninput = null;
  const input = document.getElementById("manual-value") as
    HTMLInputElement | HTMLTextAreaElement | null;
  if (input?.dataset.owner === String(taskGeneration))
    manualDrafts.set(input.dataset.draftKey!, input.value);
  applyAppearance();
  root.className = view === "session" && !templateFormActive() ? "compact" : "";
  root.innerHTML = `${view !== "session" ? `<header class="appbar"><span class="wordmark">VeraFlow <span lang="zh-CN">核流</span></span><nav aria-label="${esc(t("app"))}">${view !== "recent" ? button("nav-recent", "recentTemplates") : ""}${button("nav-settings", "settings", view === "settings" ? "selected" : "")}</nav></header>` : ""}
    ${testBuild ? `<aside class="preview-banner" role="status">${esc(t("testBuildNotice"))} · ${esc(appVersion)} · ${esc(buildCommit)}</aside>` : ""}
    ${!desktop ? `<aside class="preview-banner">${esc(t("browserPreview"))}</aside>` : ""}
    <div id="notice" role="${failure ? "alert" : "status"}" class="notice ${failure ? "error" : "success"}" ${message ? "" : "hidden"}>${esc(message)}</div>
    ${paused && session && view !== "session" ? pausedTaskView() : ""}
    ${view === "recent" ? recentView() : view === "outputs" ? outputsView() : view === "workspace" ? workspace.view() : view === "scanner" ? scannerHome() : view === "templates" ? libraryView() : view === "settings" ? settingsView() : sessionView()}
    ${view !== "session" ? `<footer>${button("nav-scanner", "freeScanner")}${library.preferences.showWorkspace ? button("nav-workspace", "workspace") : ""}${session && !(paused && focusedWorkflow) ? button("nav-session", session.mode === "complete" ? "sessionResults" : "session") : ""}<span>◉ ${esc(t("localOnly"))}</span><span>${esc(t("localNote"))}</span></footer>` : ""}`;
  click("nav-workspace", () => navigate("workspace"));
  click("nav-scanner", () =>
    navigate(session?.scanner ? "session" : "scanner"),
  );
  click("start-scanner", () => setupScanner());
  click("import-scanner-home", () => loadScannerJSON());
  click("open-legacy-library", () => navigate("templates"));
  click("nav-recent", () => navigate("recent"));
  click("open-document", pickDocument);
  click("nav-settings", () => navigate("settings"));
  click("nav-session", () => navigate("session"));
  click("resume-task", () => navigate("session"));
  if (view === "session" && !focusedWorkflow && !session?.scanner)
    root
      .querySelector(".capture-field.active")
      ?.scrollIntoView({ block: "nearest" });
  if (view === "recent") bindRecent();
  else if (view === "outputs") bindOutputs();
  else if (view === "workspace") workspace.bind(root);
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
    const s = session!;
    s.scannerOutputTemplate = (e.target as HTMLTextAreaElement).value;
    const value = document.getElementById("free-preview-value");
    const heading = document.getElementById("free-preview-heading");
    if (value) value.textContent = freeScannerOutput(s);
    if (heading)
      heading.textContent = t(
        s.scannerOutputTemplate ? "outputPreview" : "capturedValue",
      );
    updateScannerMatches();
  });
  click("scanner-rename", async () => {
    await editScannerName(session!.active);
    render();
    focus(`field-${session!.active}`);
  });
  click("scanner-import", loadScannerJSON);
  click("scanner-paste", async () => {
    await pasteTask(
      scannerValue(session!),
      session!.fields[session!.active].name,
      (text) => platform.pasteToSource(text),
    );
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
    await copyTask(text, t("copyTemplate"));
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
  scannerReordering = false;
  taskToolsOpen = false;
  manualOpen = true;
  scannerOutput = "copy";
  if (session.mode === "verify") reverification = "all";
  render();
  focus(session.mode === "verify" ? "manual-value" : `field-${session.active}`);
}
function scannerControls(secondaryOnly = false): string {
  const s = session!;
  return `<section class="scanner-tools" aria-label="${esc(t("scanner"))}">
    <div class="scanner-bottom-actions"><div class="toolbar">
      ${secondaryOnly ? "" : (s.mode === "verify" ? "" : button("verify-start", "verifyStart")) + button("scanner-copy", "copyField", "primary") + button("scanner-paste", "pasteToApp", "", !desktop)}
    </div><div class="toolbar">${button("scanner-capture-mode", "scannerNewValue")}${button("scanner-rename", "renameField")}${button("scanner-save-row", s.rowLink ? "saveRow" : "saveAsRow")}</div></div>
    <${secondaryOnly ? "div" : "details"} id="scanner-more" class="scanner-template-panel" ${scannerMoreOpen ? "open" : ""}>${secondaryOnly ? "" : `<summary>${esc(t("scannerMore"))}</summary>`}<h2>${esc(t("scannerTemplate"))}</h2><label for="scanner-output-template">${esc(t("scannerTemplate"))}</label><textarea id="scanner-output-template" rows="3">${esc(s.scannerOutputTemplate ?? "")}</textarea><div id="scanner-template-match" class="template-match" aria-live="polite"></div><div class="toolbar">${button("scanner-add-missing", "addMissing")}${button("scanner-copy-template", "copyTemplate")}</div><h2>${esc(t("scannerOutput"))}</h2><label for="scanner-output">${esc(t("scannerOutput"))}</label><select id="scanner-output"><option value="copy" ${scannerOutput === "copy" ? "selected" : ""}>${esc(t("copyField"))}</option><option value="paste" ${scannerOutput === "paste" ? "selected" : ""}>${esc(t("pasteField"))}</option><option value="tab" ${scannerOutput === "tab" ? "selected" : ""}>${esc(t("pasteTab"))}</option></select><p class="hint">${esc(t("scannerFocusHelp"))} <kbd>${esc(library.preferences.shortcuts.finish)}</kbd> ${esc(t("mousePasteHelp"))}</p><h2>${esc(t("useTemplate"))}</h2><label for="scanner-template">${esc(t("templates"))}</label><select id="scanner-template">${library.templates.map((tpl) => `<option value="${esc(tpl.id)}">${esc(tpl.name)}</option>`).join("")}</select>${check("scanner-keep", "keepScanner", false)}<p class="hint">${esc(t("scannerMatchHelp"))}</p>${button("scanner-apply", "useTemplate", "", !library.templates.length)}<h2>JSON</h2><div class="toolbar">${button("scanner-import", "importScanner")}${button("scanner-export-fields", "exportScannerFields")}${button("scanner-export-values", "exportScannerValues")}</div><h2>${esc(t("scannerFields"))}</h2><div class="toolbar">${button("clear", "clear")}${button("clean-lines", "removeBlankLines", "", s.fields[s.active]?.value === null)}${button("skip", "skip")}${button("scanner-remove", "removeField", "quiet danger", s.fields.length === 1)}</div></${secondaryOnly ? "div" : "details"}>
  </section>`;
}

function recentView() {
  return `<main class="settings recent-documents"><div class="section-head"><h1>${esc(t("recentTemplates"))}</h1><div class="toolbar">${button("open-outputs", "recentOutputs")}${button("open-document", "openDocument", "primary")}</div></div>
    ${recentDocuments.length ? `<ul class="recent-list">${recentDocuments.map((item, index) => `<li><button class="template-item" data-recent="${index}"><strong>${esc(item.title)}</strong><span>${esc(item.file)}</span></button></li>`).join("")}</ul>${button("clear-recent", "clearRecent", "quiet")}` : `<p>${esc(t("recentEmpty"))}</p>`}
    ${!session && lastTemplate ? sessionRecovery() : ""}</main>`;
}
function bindRecent() {
  click("open-outputs", () => navigate("outputs"));
  root.querySelectorAll<HTMLButtonElement>("[data-recent]").forEach((item) => {
    item.onclick = () =>
      void run(async () =>
        openDocument(
          await platform.openRecentDocument(Number(item.dataset.recent)),
        ),
      );
  });
  click("clear-recent", async () => {
    await platform.clearRecentDocuments();
    recentDocuments = [];
    await refreshTrayMenu().catch(() => {});
    render();
    focus("open-document");
  });
  click("restart-session", async () => {
    if (lastTemplate)
      await launch(
        lastTemplate.definition,
        undefined,
        false,
        lastTemplate.typing,
      );
  });
}
function outputsView() {
  return `<main class="settings"><div class="section-head"><h1>${esc(t("recentOutputs"))}</h1>${outputLabels.length ? button("clear-outputs", "clearOutputHistory", "quiet") : ""}</div>
  ${outputLabels.length ? `<ul class="recent-list">${outputLabels.map((entry, index) => `<li><button class="template-item ${index === selectedOutput?.index ? "selected" : ""}" data-output="${index}" aria-pressed="${index === selectedOutput?.index}"><strong>${esc(entry.title)}</strong><span>${esc(new Date(entry.time * 1000).toLocaleString(library.preferences.language))}</span></button></li>`).join("")}</ul>` : `<p>${esc(t(historyLimit() ? "outputHistoryEmpty" : "outputHistoryOff"))}</p>`}
  ${selectedOutput ? `<pre class="output history-output" tabindex="0">${esc(selectedOutput.text)}</pre><div class="toolbar">${button("copy-history", "copyOutput", "primary")}${button("save-history", "saveSections")}</div>` : ""}</main>`;
}
function bindOutputs() {
  root.querySelectorAll<HTMLButtonElement>("[data-output]").forEach((item) => {
    item.id = `output-${item.dataset.output}`;
    item.onclick = () =>
      void run(async () => {
        const index = Number(item.dataset.output);
        selectedOutput = { index, text: await platform.readOutput(index) };
        render();
        focus(item.id);
      });
  });
  click("copy-history", async () => {
    if (!selectedOutput) return;
    await platform.copy(selectedOutput.text);
    notify("copied");
  });
  click("save-history", async () => {
    if (selectedOutput)
      await platform.exportTemplates(
        selectedOutput.text,
        "veraflow-output.txt",
      );
  });
  click("clear-outputs", async () => {
    if (
      !(await confirmAction(
        "clearOutputHistoryConfirm",
        "",
        t("clearOutputHistory"),
      ))
    )
      return;
    await platform.trimOutputs(0);
    recordedOutputs = new WeakSet();
    outputLabels = [];
    selectedOutput = null;
    render();
    focus("nav-recent");
  });
}
async function pickDocument() {
  const file = await platform.pickDocument();
  if (file) await openDocument(file);
}
function libraryView(): string {
  const items = library.templates
    .filter(
      (item) =>
        (!folder || item.folder === folder) &&
        `${item.name} ${item.folder}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.folder.localeCompare(b.folder, library.preferences.language) ||
        a.name.localeCompare(b.name, library.preferences.language),
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
    <div class="toolbar template-transfer">${button("open-document", "openDocument", "primary")}${button("open-source", "openSource", "", locked)}${button("import-template", "importTemplate", "", locked)}${button("import-templates", "importTemplates", "", locked)}${button("export-templates", "exportTemplates", "", !library.templates.length)}</div><p class="sidebar-note">${esc(t("workflow"))}</p></aside>
    <main class="editor">${!session && lastTemplate ? sessionRecovery() : ""}${locked ? `<p role="alert">${esc(t("readOnly"))}</p>` : draft ? selectedTemplateView() : `<div class="empty-state"><p class="eyebrow">${esc(t("library"))}</p><h2>${esc(t("tagline"))}</h2><p>${esc(t("createHint"))}</p>${button("empty-new", "newTemplate", "primary")}</div>`}</main></div>`;
}
function comparisonView(rules: Comparison, prefix: string): string {
  return `<label for="${prefix}-mode">${esc(t("comparison"))}</label><select id="${prefix}-mode"><option value="exact" ${rules.mode === "exact" ? "selected" : ""}>${esc(t("exact"))}</option><option value="whitespace" ${rules.mode === "whitespace" ? "selected" : ""}>${esc(t("whitespace"))}</option></select>
    ${check(prefix + "-case", "caseSensitive", rules.caseSensitive)}${check(prefix + "-unicode", "unicode", rules.unicode)}${check(prefix + "-punctuation", "punctuation", rules.punctuation)}${check(prefix + "-lines", "collapseLines", rules.collapseLines)}<p class="hint">${esc(t("rulesNote"))}</p>`;
}
function selectedTemplateView(): string {
  if (!focusedWorkflow)
    return `<div id="template-preview">${outputPreview(draft!)}</div>${editorView()}`;
  return `<h2>${esc(draft!.name)}</h2>
    <div id="template-preview">${outputPreview(draft!)}</div>
    <div class="actions">${button("start-form", "fillForm", "primary")}${button("start", "scannerWorkflow")}</div>
    <details id="template-edit" ${templateEditorOpen || dirty ? "open" : ""}>
      <summary>${esc(t("editTemplate"))}</summary>
      ${editorView()}
    </details>`;
}
function editorView(): string {
  const d = draft!;
  if (d.placeholderStyle === "source") {
    return `<div class="toolbar">${button("export-source", "exportSource")}${button("export-template", "exportTemplate")}${button("duplicate", "duplicate")}${button("delete", "delete", "danger")}</div>
      ${field("template-name", "name", d.name, 'maxlength="250"')}
      ${field("template-folder", "folder", d.folder, 'maxlength="250"')}
      <label for="template-content">${esc(t("sourceText"))}</label>
      <textarea id="template-content" rows="12" spellcheck="false">
${esc(d.content)}</textarea><ol id="field-order" class="sr-only"></ol>
      <details><summary>${esc(t("templateSettings"))}</summary>${check("template-verify", "verificationEnabled", d.verificationEnabled)}${check("typing-verify", "typingVerification", d.typingVerification ?? false)}${comparisonView(d.comparison, "template")}</details>
      <div class="actions">${button("save", "save")}${button("source-csv", "sourceCSV")}${focusedWorkflow ? "" : button("start-form", "fillForm", "primary") + button("start", "scannerWorkflow")}</div>`;
  }
  return `<div class="section-head"><p class="eyebrow">${esc(t("library"))}</p><div class="toolbar">${button("export-template", "exportTemplate")}${button("duplicate", "duplicate")}${button("delete", "delete", "danger")}</div></div>
  <div class="metadata"> <div>${field("template-name", "name", d.name, 'maxlength="250"')}</div><div>${field("template-folder", "folder", d.folder, 'maxlength="250"')}</div></div>
  <label for="placeholder-style">${esc(t("placeholderStyle"))}</label><select id="placeholder-style"><option value="braces" ${d.placeholderStyle === "braces" ? "selected" : ""}>${esc(t("bracesStyle"))}</option><option value="angle" ${d.placeholderStyle !== "braces" ? "selected" : ""}>${esc(t("angleStyle"))}</option></select><p class="hint">${esc(t("escapeHelp"))}</p>
  ${check("email-enabled", "emailMode", d.email?.enabled ?? false)}
  ${d.email?.enabled ? `<section class="email-template"><p class="hint">${esc(t("emailTemplateHelp"))}</p>${check("email-subject-enabled", "enableSubject", d.email.subjectEnabled !== false)}${d.email.subjectEnabled !== false ? field("email-subject", "subject", d.email.subject) : ""}${field("email-to", "to", d.email.to)}${check("email-cc-enabled", "enableCc", d.email.ccEnabled)}${d.email.ccEnabled ? field("email-cc", "cc", d.email.cc) : ""}${check("email-bcc-enabled", "enableBcc", d.email.bccEnabled)}${d.email.bccEnabled ? field("email-bcc", "bcc", d.email.bcc) : ""}<h2>${esc(t("emailOrder"))}</h2><p class="hint">${esc(t("emailOrderHelp"))}</p><p class="hint">${esc(t("reorderHelp"))}</p><ol id="email-order" class="field-order">${emailOrderView(d)}</ol></section>` : ""}
  <label for="template-content">${esc(t(d.email?.enabled ? "body" : "content"))}</label><textarea id="template-content" class="code template-text" spellcheck="false" aria-describedby="placeholder-help">${esc(d.content)}</textarea><p id="placeholder-help" class="hint">${esc(t(d.placeholderStyle === "braces" ? "bracePlaceholderHelp" : "placeholderHelp"))}</p>
  <label for="extra-scanner-fields">${esc(t("extraScannerFields"))}</label><textarea id="extra-scanner-fields" rows="3" spellcheck="false" aria-describedby="extra-fields-help extra-fields-error">${esc(extraFieldInput ?? (d.extraFields ?? []).join("\n"))}</textarea><p id="extra-fields-help" class="hint">${esc(t("extraFieldsHelp"))}</p><p id="extra-fields-error" role="alert" ${extraFieldsInvalid ? "" : "hidden"}>${extraFieldsInvalid ? esc(t("invalidExtraFields")) : ""}</p>
  <div class="editor-bottom"><section><h2>${esc(t("fields"))}</h2><p class="hint">${esc(t("reorderHelp"))}</p><ol id="field-order" class="field-order">${orderView()}</ol></section><details><summary>${esc(t("templateSettings"))}</summary>${check("template-verify", "verificationEnabled", d.verificationEnabled)}${check("typing-verify", "typingVerification", d.typingVerification ?? false)}${comparisonView(d.comparison, "template")}</details></div>
  <div class="actions">${button("save", "save")}${focusedWorkflow ? "" : button("start-form", "fillForm", "primary") + button("start", layoutOverride === "classic" ? "start" : "scannerWorkflow")}</div><p class="hint">${esc(t("keyboardHelp"))}</p>`;
}
function emailOrderView(template: Template): string {
  const parts = emailSections(template).filter((p) => p.key !== "body");
  return (
    parts
      .map(
        (part, index) =>
          `<li data-reorder="${index}">${dragHandle()}<span>${esc(t(part.key))}</span><button id="email-order-${part.key}-up" data-email-key="${part.key}" data-email-move="-1" aria-label="${esc(t("moveUp"))} ${esc(t(part.key))}" ${index === 0 ? "disabled" : ""}>↑</button><button id="email-order-${part.key}-down" data-email-key="${part.key}" data-email-move="1" aria-label="${esc(t("moveDown"))} ${esc(t(part.key))}" ${index === parts.length - 1 ? "disabled" : ""}>↓</button></li>`,
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
          `<li data-reorder="${index}">${dragHandle()}<code>${esc(name)}</code><span><button data-up="${index}" aria-label="${esc(t("moveUp") + " " + name)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-down="${index}" aria-label="${esc(t("moveDown") + " " + name)}" ${index === fields.length - 1 ? "disabled" : ""}>↓</button></span></li>`,
      )
      .join("") || `<li class="hint">${esc(t("noFields"))}</li>`
  );
}
function dragHandle() {
  return `<span class="drag-handle" data-drag-handle draggable="true" aria-hidden="true">⠿</span>`;
}
function moveCaptureField(from: number, to: number) {
  const active = captureFieldNames(draft!);
  if (!active[from] || !active[to]) return;
  const order = (draft!.fieldOrder = rememberedFieldOrder(draft!));
  const destination = order.indexOf(active[to]);
  order.splice(order.indexOf(active[from]), 1);
  order.splice(destination, 0, active[from]);
  dirty = true;
  document.getElementById("field-order")!.innerHTML = orderView();
  bindOrder();
}
function reorderEmailSections(from: number, to: number) {
  const parts = emailSections(draft!).filter((p) => p.key !== "body");
  if (!parts[from] || !parts[to]) return;
  const order = [
    ...new Set([
      ...(draft!.email!.order ?? defaultEmailOrder),
      ...defaultEmailOrder,
    ]),
  ];
  const destination = order.indexOf(parts[to].key as (typeof order)[number]);
  const [part] = order.splice(
    order.indexOf(parts[from].key as (typeof order)[number]),
    1,
  );
  order.splice(destination, 0, part);
  draft!.email!.order = order;
  dirty = true;
  render();
}
function bindOrder() {
  bindReorder(
    document.getElementById("field-order"),
    moveCaptureField,
    () => !busy,
  );
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
function refreshTemplatePreview(event: Event) {
  const target = event.target as HTMLElement;
  if (
    ![
      "template-content",
      "email-subject",
      "email-to",
      "email-cc",
      "email-bcc",
    ].includes(target.id)
  )
    return;
  const panel = document.getElementById("template-preview");
  if (panel && draft) panel.innerHTML = outputPreview(draft);
}
function sourceDefinition(content: string, name: string): Template {
  if (!content.trim()) throw Error("invalidSource");
  const source = parseSource(content);
  return {
    id: crypto.randomUUID(),
    name: source.title ?? name,
    folder: "",
    content,
    placeholderStyle: "source",
    fieldOrder: [],
    verificationEnabled: library.preferences.verificationDefault,
    comparison: structuredClone(library.preferences.comparison),
  };
}
function documentTemplate(file: OpenDocument) {
  if (file.content === null || file.format !== "source")
    throw Error("invalidImport");
  const name = file.name
    .replace(/\.(veraflow|vf)$/i, "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .slice(0, 250)
    .trim();
  return sourceDefinition(file.content, name || t("sourceTemplate"));
}
function csvRows(content: string) {
  const data = csvTable(parseCSV(content), true, "CSV");
  if (!data.rows.length) throw Error("invalidCSV");
  return data;
}
function csvRowPicker(data: DataTable): Input {
  return {
    key: "row",
    label: t("csvRow"),
    options: data.rows.map((row, i) => ({
      value: String(i),
      label: `${i + 1} · ${data.fields
        .slice(0, 3)
        .map((key) => row.values[key].slice(0, 40))
        .join(" · ")}`,
    })),
    searchOptions: {
      label: t("searchCSVRows"),
      previous: t("previous"),
      next: t("next"),
      match: (id, query) => {
        if (String(Number(id) + 1) === query) return true;
        const values = Object.values(data.rows[Number(id)].values);
        return values.some((value) =>
          value.toLocaleLowerCase().includes(query),
        );
      },
      details: (id) =>
        data.fields.map((key) => [key, data.rows[Number(id)].values[key]]),
    },
  };
}
function csvSeed(template: Template, row: DataRow) {
  const seed = startSession(template);
  seed.fields = Object.entries(row.values).map(([name, value]) => ({
    name,
    value,
    status: "captured",
  }));
  return seed;
}
async function openDocumentTemplate(
  template: Template,
  row?: DataRow,
  file?: OpenDocument,
) {
  let workflow = parseSource(template.content).workflow;
  if (!workflow) {
    const choice = await formDialog(
      template.name,
      [
        {
          key: "workflow",
          label: t("openWorkflow"),
          options: [
            { value: "", label: t("chooseWorkflow") },
            { value: "form", label: t("fillForm") },
            { value: "scanner", label: t("scanner") },
          ],
        },
      ],
      t("start"),
      t("cancel"),
      (values) => (values.workflow ? null : t("chooseWorkflowRequired")),
    );
    if (!choice) return;
    workflow = choice.workflow === "form" ? "form" : "scanner";
  }
  if (!(await abandonDraft())) return;
  const opened = await launch(
    template,
    undefined,
    false,
    workflow === "form",
    undefined,
    row ? csvSeed(template, row) : undefined,
  );
  if (opened && file?.recentToken != null) {
    await platform.rememberDocument(file.recentToken, template.name);
    recentDocuments = await platform.recentDocuments();
    await refreshTrayMenu().catch(() => {});
  }
}
async function openDocument(file: OpenDocument) {
  if (file.content === null) throw Error("invalidImport");
  if (file.format === "source") {
    await openDocumentTemplate(documentTemplate(file), undefined, file);
    return;
  }
  const data = csvRows(file.content);
  const templates = library.templates.filter(
    (template) => template.placeholderStyle === "source",
  );
  const choice = await formDialog(
    file.name,
    [
      csvRowPicker(data),
      {
        key: "template",
        label: t("templates"),
        options: [
          { value: "", label: t("csvFreeScanner") },
          { value: "file", label: t("csvUseTemplate") },
          ...templates.map(({ id, name }) => ({ value: id, label: name })),
        ],
      },
    ],
    t("start"),
    t("cancel"),
  );
  if (!choice) return;
  const row = data.rows[Number(choice.row)];
  if (choice.template === "file") {
    const source = await platform.pickDocument(true);
    if (source)
      await openDocumentTemplate(documentTemplate(source), row, source);
  } else if (choice.template) {
    const definition = templates.find((item) => item.id === choice.template);
    if (definition) await openDocumentTemplate(definition, row);
  } else {
    const scanner = startScanner(
      library.preferences,
      file.name,
      data.fields[0],
    );
    scanner.fields = csvSeed(scanner.template, row).fields;
    if (
      scanner.template.verificationEnabled &&
      scanner.fields.some((field) => field.value?.trim())
    )
      beginReverification(scanner, true);
    await launchScanner(scanner);
  }
}
async function drainDocuments() {
  if (!documentsPending || busy || quitting) return;
  documentsPending = false;
  await run(async () => {
    const file = await platform.takeDocument();
    if (!file) return;
    documentsPending = true;
    await openDocument(file);
  });
}
function bindLibrary() {
  click("open-source", async () => {
    if (!(await abandonDraft())) return;
    if (selected) selectTemplate(selected);
    render();
    const content = await platform.importTemplates("source");
    if (content === null) return;
    const definition = sourceDefinition(
      sourceDefinitionText(content),
      t("sourceTemplate"),
    );
    await persist({
      ...library,
      templates: [...library.templates, definition],
    });
    selectTemplate(definition.id);
    templateEditorOpen = true;
    render();
    focus("template-name");
  });
  click("export-source", async () => {
    await platform.exportTemplates(
      sourceDefinitionText(draft!.content, draft!.name.trim()),
      "template.veraflow",
    );
  });
  click("source-csv", async () => {
    const csv = await platform.importTemplates("csv");
    if (csv === null) return;
    const data = csvRows(csv);
    const result = await formDialog(
      t("sourceCSV"),
      [csvRowPicker(data)],
      t("fillForm"),
    );
    if (!result) return;
    await saveDraft();
    await launch(
      draft!,
      undefined,
      false,
      true,
      undefined,
      csvSeed(draft!, data.rows[Number(result.row)]),
    );
  });
  root.oninput = refreshTemplatePreview;
  on("template-edit", "toggle", (event) => {
    const details = event.target as HTMLDetailsElement;
    if (details.isConnected) templateEditorOpen = details.open;
  });
  click("restart-session", async () => {
    if (lastTemplate && (await abandonDraft()))
      await launch(
        lastTemplate.definition,
        undefined,
        false,
        lastTemplate.typing,
      );
  });
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
  on("typing-verify", "change", (e) => {
    if ((e.target as HTMLInputElement).checked)
      draft!.typingVerification = true;
    else delete draft!.typingVerification;
    dirty = true;
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
  bindReorder(
    document.getElementById("email-order"),
    reorderEmailSections,
    () => !busy,
  );
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
  click("start-form", async () => {
    await saveDraft();
    await launch(draft!, undefined, false, true);
  });
  click("start", async () => {
    await saveDraft();
    await launch(draft!);
  });
}
function selectTemplate(id: string) {
  templateEditorOpen = false;
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
  templateControls(draft);
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
  if (next === "workspace" && !library.preferences.showWorkspace)
    next = "templates";
  if (!(await abandonDraft())) return;
  if (next === "session" && !session) return;
  const labels =
    next === "outputs" && historyLimit()
      ? (await platform.listOutputs()).slice(0, historyLimit())
      : [];
  outputLabels = labels;
  selectedOutput = null;
  if (
    view === "session" &&
    next !== "session" &&
    session &&
    session.mode !== "complete"
  ) {
    await bindShortcuts(null, dispatch);
    await platform.mouseSource(false);
    paused = true;
  }
  let shortcutError: unknown;
  if (next === "session" && paused) {
    try {
      await bindShortcuts(
        library.preferences.globalShortcuts &&
          !templateFormActive() &&
          !["review", "complete"].includes(session!.mode)
          ? library.preferences.shortcuts
          : null,
        dispatch,
      );
    } catch (error) {
      await bindShortcuts(null, dispatch);
      shortcutError = error;
    }
    paused = false;
  }
  view = next;
  message = "";
  if (next === "templates" && selected) selectTemplate(selected);
  if (next === "settings") settingsDraft = structuredClone(library.preferences);
  await platform.compact(
    next === "session" &&
      !templateFormActive() &&
      !["review", "complete"].includes(session?.mode ?? ""),
    library.preferences.alwaysOnTop,
  );
  render();
  if (next === "session")
    focus(
      templateFormActive()
        ? controlFocus(
            typingCheck ? "typing-check" : `form-field-${session!.active}`,
          )
        : document.getElementById("manual-value")
          ? "manual-value"
          : `field-${session?.active ?? 0}`,
    );
  if (shortcutError) report(shortcutError);
}
function settingsView(): string {
  const p = (settingsDraft ??= structuredClone(library.preferences));
  return `<main class="settings"><header class="section-head"><h1>${esc(t("settings"))}</h1>${button("update-app", "updateApp")}</header><p class="hint">${esc(t("updateHelp"))}</p><details class="legacy-library"><summary>${esc(t("legacyLibrary"))}</summary><p>${esc(t("legacyLibraryHelp"))}</p>${button("open-legacy-library", "templates")}</details><div class="settings-grid"><section><h2>${esc(t("general"))}</h2><label for="language">${esc(t("language"))}</label><select id="language"><option value="en" ${p.language === "en" ? "selected" : ""}>English</option><option value="zh-CN" ${p.language === "zh-CN" ? "selected" : ""}>简体中文</option></select><label for="theme">${esc(t("theme"))}</label><select id="theme">${(["SYSTEM", "LIGHT", "DARK"] as const).map((theme) => `<option value="${theme}" ${theme === p.theme ? "selected" : ""}>${esc(t(theme))}</option>`).join("")}</select>${check("launchAtLogin", "launchAtLogin", p.launchAtLogin)}${check("minimizeToTray", "minimizeToTray", p.minimizeToTray)}${check("alwaysOnTop", "alwaysOnTop", p.alwaysOnTop)}${check("autoAdvance", "autoAdvance", p.autoAdvance)}${check("focusedWorkflow", "focusedView", p.focusedWorkflow ?? false)}${check("hideLivePreview", "hideLivePreview", p.hideLivePreview ?? false)}${check("showWorkspace", "showWorkspace", p.showWorkspace ?? false)}${check("tabBetweenSections", "sectionTab", p.tabBetweenSections ?? false)}<label for="outputHistoryLimit">${esc(t("outputHistoryLimit"))}</label><input id="outputHistoryLimit" type="number" min="0" max="${maxOutputHistoryLimit}" step="1" value="${historyLimit(p)}" aria-describedby="output-history-help"><p id="output-history-help" class="hint">${esc(t("outputHistoryHelp"))}</p></section>
  <section><h2>${esc(t("verification"))}</h2>${check("verificationDefault", "verificationDefault", p.verificationDefault)}${check("verifiedBackground", "verifiedBackground", p.verifiedBackground)}${comparisonView(p.comparison, "default")}</section>
  <section><h2>${esc(t("privacy"))}</h2>${check("clearAfterCompletion", "clearAfterCompletion", p.clearAfterCompletion)}${check("restoreClipboard", "restoreClipboard", p.restoreClipboard)}<p class="hint">${esc(t("clipboardDefaultHelp"))}</p><p class="hint">${esc(t("quitPrivacy"))}</p></section>
  <section><h2>${esc(t("shortcuts"))}</h2><p class="hint">${esc(t("keyboardHelp"))}</p><p class="hint">${esc(t("shortcutHelp"))}</p>${check("globalShortcuts", "globalShortcuts", p.globalShortcuts)}${button("alternate-shortcuts", "alternateShortcuts")}${actions.map((action) => field("key-" + action, action === "cancel" ? "cancelSession" : action, p.shortcuts[action], 'class="shortcut-input"')).join("")}</section></div><div class="actions">${button("save-settings", "saveSettings", "primary", locked)}</div><section class="about" aria-labelledby="about-heading"><h2 id="about-heading">${esc(t("about"))}</h2><p>${esc(t("copyright"))}</p><a id="repository-link" href="https://github.com/iandorsey00/veraflow" target="_blank" rel="noopener noreferrer">${esc(t("repository"))}</a></section></main>`;
}
function refreshTrayMenu() {
  return platform.trayMenu(library.preferences.language, !!availableUpdate);
}
async function checkAvailableUpdate() {
  if (updateCheck) return updateCheck;
  updateCheck = (async () => {
    availableUpdate = await platform.checkUpdate();
    await refreshTrayMenu().catch(() => {});
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
    "focusedWorkflow",
    "hideLivePreview",
    "showWorkspace",
    "tabBetweenSections",
  ] as const)
    on(key, "change", (e) => {
      p[key] = (e.target as HTMLInputElement).checked;
      if (
        (key === "focusedWorkflow" ||
          key === "hideLivePreview" ||
          key === "showWorkspace" ||
          key === "tabBetweenSections") &&
        !p[key]
      )
        delete p[key];
      dirty = true;
    });
  bindComparison("default", p.comparison);
  for (const action of actions)
    on("key-" + action, "input", (e) => {
      p.shortcuts[action] = (e.target as HTMLInputElement).value.trim();
      dirty = true;
    });
  on("outputHistoryLimit", "input", (event) => {
    p.outputHistoryLimit = (event.target as HTMLInputElement).valueAsNumber;
    dirty = true;
  });
  click("save-settings", async () => {
    const limit = historyLimit(p);
    if (!Number.isInteger(limit) || limit < 0 || limit > maxOutputHistoryLimit)
      throw Error("invalidHistoryLimit");
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
        old.globalShortcuts &&
          !paused &&
          view === "session" &&
          session &&
          session.mode !== "complete"
          ? old.shortcuts
          : null,
        dispatch,
      );
      await platform.autostart(old.launchAtLogin);
      throw error;
    }
    if (paused || view !== "session" || !session || session.mode === "complete")
      await bindShortcuts(null, dispatch);
    dirty = false;
    focusedWorkflow = p.focusedWorkflow === true;
    if (p.clearAfterCompletion && session?.mode === "complete")
      eraseSession(session);
    await refreshTrayMenu();
    if (limit !== historyLimit(old)) {
      await platform.trimOutputs(limit);
      if (!limit) recordedOutputs = new WeakSet();
    }
    notify("saved");
  });
}
async function configureSessionShortcuts(enabled: boolean) {
  try {
    await bindShortcuts(
      enabled && library.preferences.globalShortcuts
        ? library.preferences.shortcuts
        : null,
      dispatch,
    );
  } catch (error) {
    await bindShortcuts(null, dispatch);
    return error;
  }
}
function templateFormActive() {
  return (
    templateForm &&
    !!session &&
    ["capture", "verify", "ready"].includes(session.mode)
  );
}
async function launch(
  template: Template,
  scannerSource?: Session,
  confirmed = false,
  form = false,
  reuse?: Session,
  seed?: Session,
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
  const nextSession = scannerSource
    ? applyScanner(scannerSource, template)
    : seed
      ? applyScanner(seed, template)
      : startSession(template);
  if (reuse) {
    nextSession.fields = reuse.fields.map((field) => ({
      name: field.name,
      value: field.value,
      status:
        field.value === null
          ? field.status === "skipped"
            ? "skipped"
            : "empty"
          : "captured",
      removeBlankLines: field.removeBlankLines,
    }));
  }
  if (form || reuse) prepareWorkflow(nextSession, form);
  const shortcutError = await configureSessionShortcuts(!form);
  await platform.mouseSource(false);
  await platform.active(true);
  await platform.compact(!form, library.preferences.alwaysOnTop);
  if (session) eraseSession(session);
  session = nextSession;
  templateForm = form;
  groupSections = false;
  sectionTab = library.preferences.tabBetweenSections === true;
  deliveryMode =
    template.placeholderStyle === "source"
      ? parseSource(template.content).delivery.mode
      : "step";
  typingCheck = false;
  if (template.id !== "scanner")
    lastTemplate = { definition: nextSession.template, typing: form };
  paused = false;
  taskGeneration++;
  manualDrafts.clear();
  lastStep = null;
  emailSteps.clear();
  if (!scannerSource) {
    eraseRetainedScanner();
    returnToScanner = false;
  }
  reverification = null;
  manualOpen = false;
  sessionOptionsOpen = false;
  mouseMode = true;
  preserveClipboard = library.preferences.restoreClipboard;
  view = "session";
  preview = false;
  message = "";
  render();
  focus(
    form
      ? controlFocus(`form-field-${session.active}`)
      : session.template.placeholderStyle === "source"
        ? focusSourceScanner()
        : `field-${session.active}`,
  );
  if (!session.fields.length) focus("finish");
  if (shortcutError) report(shortcutError);
  return true;
}
async function rememberOutput(s: Session, text: string) {
  const limit = historyLimit();
  if (!limit || recordedOutputs.has(s)) return;
  try {
    await platform.recordOutput(s.template.name, text, limit);
    recordedOutputs.add(s);
  } catch (error) {
    notify(
      (error instanceof Error ? error.message : String(error)) === "historyFull"
        ? "historyFull"
        : "outputHistorySaveFailed",
      true,
    );
  }
}
async function copyTask(text: string, name: string) {
  await platform.copy(text);
  lastStep = { key: "stepCopied", name };
}
async function pasteTask(
  text: string,
  name: string,
  send: (text: string) => Promise<void>,
) {
  lastStep = { key: "stepPasteUncertain", name };
  await send(text);
  lastStep = { key: "stepPaste", name };
}
function taskName(s: Session): string {
  const table = library.workspace?.tables.find(
    (table) => table.id === s.rowLink?.tableId,
  );
  const row = table?.rows.find((row) => row.id === s.rowLink?.rowId);
  return table
    ? `${table.name}${row?.title ? ` · ${row.title}` : ""}`
    : s.template.name;
}
function fieldLabel(s: Session, name: string) {
  return s.controls?.get(name)?.label?.trim() || name;
}
function fieldUsesTextarea(s: Session, name: string, value = "") {
  const control = s.controls?.get(name);
  if (control) return control.multiline ?? control.kind === "textarea";
  return (
    s.template.placeholderStyle !== "source" ||
    /[\r\n\u0085\u2028\u2029]/u.test(value)
  );
}
function manualValueEditor(s: Session) {
  const field = s.fields[s.active];
  const attrs = 'id="manual-value" spellcheck="false"';
  const saved =
    manualDrafts.get(`${s.mode}:${field?.name ?? ""}`) ?? field?.value ?? "";
  return !field ||
    fieldUsesTextarea(s, field.name, saved) ||
    s.template.placeholderStyle !== "source"
    ? `<textarea ${attrs} rows="2"></textarea>`
    : `<input ${attrs} type="text">`;
}
function progressText(s: Session): string {
  const p = sessionProgress(s);
  const active = activeSourceFields(s);
  const total = active
    ? active.size
    : s.fields.filter((f) => fieldVisible(s, f.name)).length;
  return `${p.filled}/${total} ${t("progressCaptured")} · ${p.matched}/${total} ${t("progressMatched")}${p.skipped ? ` · ${p.skipped} ${t("skipped")}` : ""}`;
}
function lastStepView(): string {
  return `<p class="task-receipt" role="status">${esc(t("lastAction"))}: ${lastStep ? `${esc(t(lastStep.key))}${lastStep.name ? ` · ${esc(lastStep.name)}` : ""}` : esc(t("noActionYet"))}</p>`;
}
function pausedTaskView(): string {
  const s = session!;
  return `<aside class="paused-task" aria-labelledby="paused-heading"><h2 id="paused-heading">${esc(t("taskPaused"))} · ${esc(taskName(s))}</h2><p>${esc(progressText(s))}</p><p>${esc(t(sessionProgress(s).next))}${s.fields[s.active] ? ` · ${esc(fieldLabel(s, s.fields[s.active].name))}` : ""}</p>${lastStepView()}<p class="hint">${esc(t("pausePrivacy"))}</p>${button("resume-task", "resumeTask", "primary")}</aside>`;
}
function focusedSessionView(s: Session): string {
  const p = library.preferences,
    f = s.fields[s.active],
    progress = sessionProgress(s);
  const active = activeSourceFields(s);
  const toolbar = `<div class="task-toolbar">${!s.scanner && s.mode !== "delivery" ? button("switch-form", "fillForm") : ""}${button("pause-task", "pauseTask")}${button("toggle-workflow", "classicView")}</div>`;
  const heading = `<header class="task-heading"><h1>${esc(taskName(s))}</h1>${toolbar}<p class="task-progress">${esc(progressText(s))}</p></header>`;
  if (s.mode === "delivery") {
    const parts = renderEmail(s),
      index = s.deliveryIndex ?? 0;
    return `<main class="capture-panel focused-session">${heading}<h2>${esc(t("nextEmail"))} · ${esc(t(parts[index].key))}</h2><ol class="email-checklist" aria-label="${esc(t("emailOrder"))}">${parts.map((part, i) => `<li ${index === i ? 'aria-current="step"' : ""}><strong>${esc(t(part.key))}</strong> · ${esc(t(emailSteps.get(part.key) ?? "transferPending"))}</li>`).join("")}</ol><pre class="output">${esc(parts[index].text)}</pre><p class="hint">${esc(t("emailDeliveryHelp"))}</p><p><kbd>${esc(p.shortcuts.finish)}</kbd> ${esc(t("emailPasteNext"))}</p>${lastStepView()}<div class="toolbar">${button("email-copy", "emailCopy")}${button("email-back", "emailManualBack", "", index === 0)}${button("email-next", "emailManualNext", "", !!s.deliveryDone)}${button("email-done", "emailDone", "primary", !s.deliveryDone)}</div><p class="hint">${esc(t("emailBackHelp"))}</p>${s.deliveryDone ? `<p>${esc(t("emailBodyPasted"))}</p>` : ""}<div class="actions">${button("cancel-session", "cancelSession", "quiet danger")}</div></main>`;
  }
  const ready = s.mode === "ready";
  const configured = f && s.controls?.has(f.name);
  const status = (key: Session["fields"][number]["status"]) =>
    key === "verified" ? t("matchedSource") : t(key);
  const selectedMatched = f?.status === "verified";
  return `<main class="capture-panel focused-session ${s.scanner ? "scanner-panel" : ""}">${heading}
    ${s.scanner ? '<div class="scanner-layout free-scanner-layout"><div class="scanner-work">' : ""}
    <section class="active-task" aria-labelledby="active-task-heading"><p class="eyebrow">${esc(t(progress.next))}</p><h2 id="active-task-heading">${esc(ready ? t("nextOutput") : f ? fieldLabel(s, f.name) : t("noFields"))}</h2>
    ${f ? `<pre tabindex="0" aria-label="${esc(t("capturedValue"))}" class="active-value ${p.verifiedBackground && selectedMatched ? "verified-background" : ""}">${esc(f.value ?? t("empty"))}</pre><p class="active-status">${esc(status(f.status))}</p>` : ""}
    ${f?.removeBlankLines ? `<p class="hint">${esc(t("blankLinesRemoved"))}</p>` : ""}
    ${f?.status === "mismatch" ? mismatchView(f.value!, f.candidate!) : ""}
    ${configured ? activeScannerControl(s) : ""}
    ${!ready && (!s.scanner || progress.checking || f?.value === null) ? `<p class="hint"><kbd>${esc(p.shortcuts[progress.checking ? "verify" : "capture"])}</kbd> ${esc(t(progress.checking ? "compareSelection" : "captureSelected"))}</p>` : ""}
    ${
      !ready
        ? `<div class="toolbar task-primary">${mouseMode && (progress.checking || f?.value === null) ? button("mouse-transfer", progress.checking ? "compareSelection" : "captureSelected", "primary", !desktop) : ""}${s.scanner && f?.value !== null && !progress.checking ? button("verify-start", "checkField", selectedMatched || !s.template.verificationEnabled ? "" : "primary") : ""}${s.scanner && f?.value !== null && !progress.checking ? button("scanner-copy", "copyField", selectedMatched || !s.template.verificationEnabled ? "primary" : "", !selectedMatched && s.template.verificationEnabled) + button("scanner-paste", "pasteToApp", "", !desktop || (!selectedMatched && s.template.verificationEnabled)) : ""}</div>
    <details id="manual-entry" ${manualOpen ? "open" : ""}><summary>${esc(t("manualEntry"))}</summary><form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label>${manualValueEditor(s)}<div class="toolbar">${button("apply-value", progress.checking ? "compare" : "apply", !desktop ? "primary" : "")}${button("use-clipboard", "clipboard")}</div></form></details>`
        : `<div class="toolbar">${button("finish", s.template.placeholderStyle === "source" ? "prepareSections" : s.template.email?.enabled ? "emailPrepare" : "finish", "primary")}${button("preview", "preview")}</div>`
    }
    <div class="toolbar task-navigation">${button("mouse-back", "previous")}${button("mouse-forward", "next")}</div>${lastStepView()}</section>
    <section class="task-checklist" aria-labelledby="task-fields"><h2 id="task-fields">${esc(t("scannerFields"))}</h2><ol class="capture-fields" aria-label="${esc(t("fields"))}">${s.fields.map((field, index) => (!fieldVisible(s, field.name, active) ? "" : `<li ${s.scanner ? `data-reorder="${index}"` : ""}><button id="field-${index}" data-field="${index}" class="capture-field ${field.status} ${index === s.active ? "active" : ""} ${p.verifiedBackground && field.status === "verified" ? "verified-background" : ""}" ${index === s.active ? 'aria-current="step"' : ""}><span class="state-icon" aria-hidden="true">${field.status === "verified" ? "✓" : index === s.active ? "→" : "○"}</span><span class="field-body"><strong>${esc(fieldLabel(s, field.name))}</strong><span class="field-value">${esc(field.value ?? "—")}</span></span><span class="status-label">${esc(status(field.status))}</span></button>${s.scanner && scannerReordering ? `<div class="scanner-field-tools">${dragHandle()}<span><button data-scanner-up="${index}" aria-label="${esc(t("moveUp") + " " + field.name)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-scanner-down="${index}" aria-label="${esc(t("moveDown") + " " + field.name)}" ${index === s.fields.length - 1 ? "disabled" : ""}>↓</button></span></div>` : ""}</li>`)).join("")}</ol></section>
    <details id="task-tools" class="task-tools" ${taskToolsOpen ? "open" : ""}><summary>${esc(t("taskTools"))}</summary><p class="hint">${esc(t("matchMeaning"))}</p>
    ${s.scanner ? `<div class="toolbar">${button("scanner-add", "addField")}<button id="scanner-reorder" aria-pressed="${scannerReordering}">${esc(t(scannerReordering ? "doneReordering" : "reorderFields"))}</button></div>${scannerControls(true)}` : `<div class="toolbar">${button("verify-start", "verifyStart")}${button("clear", "clear")}${button("clean-lines", "removeBlankLines", "", !f || f.value === null)}${button("skip", "skip")}</div>${!s.template.verificationEnabled && !ready ? button("finish", s.template.placeholderStyle === "source" ? "prepareSections" : s.template.email?.enabled ? "emailPrepare" : "finish") : ""}`}
    ${s.fields.some((field) => field.value !== null) ? `<div class="reverification"><h3>${esc(t("verifyAgain"))}</h3><div class="toolbar">${button("reverify-field", "reverifyField", "", !f || f.value === null)}${button("reverify-all", "reverifyAll")}</div></div>` : ""}
    ${s.scanner ? `<p class="vera-id">${esc(s.scannerId)}${s.rowLink ? `<br>${esc(s.rowLink.tableId)}` : ""}</p><p class="hint">${esc(t(s.rowLink ? "rowSaveHelp" : "scannerTemporary"))}</p>` : ""}
    </details>
    <details id="session-options" ${sessionOptionsOpen ? "open" : ""}><summary>${esc(t("sessionOptions"))}</summary>${check("mouse-mode", "mouseMode", mouseMode)}${check("preserve-clipboard", "preserveClipboard", preserveClipboard)}<p class="hint">${esc(t("preserveClipboardHelp"))}</p><p class="hint">${esc(t("mouseHelp"))}</p><dl class="shortcut-list">${actions.map((a) => `<dt>${esc(t(a === "cancel" ? "cancelSession" : a))}</dt><dd><kbd>${esc(p.shortcuts[a])}</kbd></dd>`).join("")}</dl></details>
    ${
      preview
        ? `<pre class="output">${esc(
            s.template.email?.enabled
              ? renderEmail(s)
                  .map((part) => `${t(part.key)}: ${part.text}`)
                  .join("\n\n")
              : renderSession(s),
          )}</pre>`
        : ""
    }
    ${!library.preferences.hideLivePreview && !s.scanner && !preview ? outputPreview(s.template, s) : ""}
    <details class="focus-guide"><summary>${esc(t("quickGuide"))}</summary><ol><li>${esc(t("guideCapture"))}</li><li>${esc(t("guideCheck"))}</li><li>${esc(t("guideCopy"))}</li><li>${esc(t("guidePause"))}</li></ol></details><div class="actions">${button("cancel-session", s.scanner ? "endScanner" : s.template.placeholderStyle === "source" ? "closeSession" : "cancelSession", "quiet danger")}</div>${s.scanner ? `</div>${!p.hideLivePreview ? freeScannerPreview(s) : ""}</div>` : ""}</main>`;
}

function outputPreview(template: Template, s?: Session): string {
  try {
    return `<section class="template-output" aria-label="${esc(t("outputPreview"))}">
      <h2>${esc(t("outputPreview"))}</h2>
      ${previewSections(template, s)
        .map(
          (part) =>
            `${"label" in part ? `<h3>${esc(part.label)}</h3>` : template.email?.enabled ? `<h3>${esc(tr(part.key))}</h3>` : ""}<pre>${part.parts
              .map((token) =>
                token.missing
                  ? `<mark>${esc(token.text)}</mark>`
                  : esc(token.text),
              )
              .join("")}</pre>`,
        )
        .join("")}
    </section>`;
  } catch (error) {
    return `<p class="hint">${esc(errorText(error))}</p>`;
  }
}

function sourceConditionDrivers(s: Session) {
  return s.template.placeholderStyle === "source"
    ? parseSource(s.template.content).conditionDrivers
    : [];
}
function fieldControl(
  s: Session,
  index: number,
  id: string,
  comparing = false,
): string {
  const field = s.fields[index];
  const definition = s.controls?.get(field.name);
  const value = comparing ? "" : (field.value ?? "");
  const name = fieldLabel(s, field.name);
  const label = `<label for="${id}">${esc(name)}</label>`;
  const attrs = `id="${id}" data-control="${index}" ${id.startsWith("form-field-") ? `aria-describedby="form-state-${index}"` : ""} autocomplete="off"`;
  if (definition?.options) {
    const options = [...definition.options].map(([key, text]) => [
      key,
      definition.kind === "boolean"
        ? t(key === "true" ? "booleanYes" : "booleanNo")
        : text,
    ]);
    const conditionalChoice =
      options.length <= 5 && sourceConditionDrivers(s).includes(field.name);
    if (definition.kind === "radio" || conditionalChoice) {
      if (
        conditionalChoice &&
        definition.optional &&
        !comparing &&
        id.startsWith("form-field-")
      )
        options.push(["", t("leaveUnanswered")]);
      return `<fieldset id="${id}"><legend>${esc(name)}</legend>
        ${options.map(([key, text], i) => `<label class="check"><input type="radio" id="${id}-${i}" name="${id}" data-control="${index}" ${id.startsWith("form-field-") ? `aria-describedby="form-state-${index}"` : ""} value="${esc(key)}" ${key === value ? "checked" : ""}>${esc(definition.optionLabels?.get(key) ?? (text || key))}</label>`).join("")}
      </fieldset>`;
    }
    if (
      !comparing &&
      (definition.kind === "checkbox" || definition.kind === "switch")
    ) {
      return `<label class="check"><input type="checkbox" ${attrs} ${definition.kind === "switch" ? 'role="switch" class="toggle-switch"' : ""} ${value === "yes" ? "checked" : ""}>${esc(name)} · ${esc(definition.options.get("yes") || t("enableField"))}</label>`;
    }
    return `${label}<select ${attrs}>
      <option value="">${esc(t("chooseValue"))}</option>
      ${options.map(([key, text]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(definition.optionLabels?.get(key) ?? (text || key))}</option>`).join("")}
    </select>`;
  }
  if (fieldUsesTextarea(s, field.name, value))
    return `${label}<textarea ${attrs} rows="2">
${esc(value)}</textarea>`;
  const kind =
    definition?.kind === "textarea" ? "text" : (definition?.kind ?? "text");
  return `${label}<input ${attrs} type="${kind}" ${kind === "number" ? 'step="any"' : ""} value="${esc(value)}">`;
}

function controlValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  return element instanceof HTMLInputElement && element.type === "checkbox"
    ? element.checked
      ? "yes"
      : "no"
    : element.value;
}
function controlFocus(id: string) {
  const element = document.getElementById(id);
  return (
    element?.querySelector<HTMLInputElement>("input:checked, input")?.id ?? id
  );
}
function templateFormView(s: Session): string {
  const active = activeSourceFields(s);
  const fields = s.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => active || fieldVisible(s, field.name));
  // Dependencies precede their fields. Other selections follow the text fields.
  const dependencies = new Set([
    ...sourceConditionDrivers(s),
    ...[...(s.controls?.values() ?? [])].flatMap((control) =>
      control.when ? [control.when.name] : [],
    ),
  ]);
  const rank = (name: string) =>
    dependencies.has(name) ? 0 : s.controls?.get(name)?.options ? 2 : 1;
  fields.sort((a, b) => rank(a.field.name) - rank(b.field.name));
  const f = s.fields[s.active];
  return `<main class="capture-panel template-form ${focusedWorkflow ? "focused-session" : ""}">
    <h1>${esc(s.template.name)}</h1>
    <div class="task-toolbar">${button("switch-scanner", "openInScanner")}${button("pause-task", "pauseTask")}</div>
    ${focusedWorkflow ? `<p class="task-progress">${esc(progressText(s))}</p>` : ""}
    ${
      typingCheck && f
        ? `<p>${esc(t("reenterValue"))}</p>
      ${fieldControl(s, s.active, "typing-check", true)}
      <div class="actions">${button("submit-typing-check", "compare", "primary")}${button("edit-responses", "editResponses")}</div>`
        : `<div class="template-form-grid ${library.preferences.hideLivePreview ? "without-preview" : ""}"><div>
      ${fields
        .map(
          ({
            field,
            index,
          }) => `<div class="template-form-field" data-form-row="${index}" ${active && !active.has(field.name) ? "hidden" : ""}>
        ${fieldControl(s, index, `form-field-${index}`)}
        <small id="form-state-${index}">${esc(t(field.status === "verified" ? "matchedEntry" : field.status))}</small>
      </div>`,
        )
        .join("")}
      <div class="actions">${button("finish", s.template.placeholderStyle === "source" ? "prepareSections" : s.template.email?.enabled ? "emailPrepare" : "finish", "primary")}</div>
    </div><div id="form-output" ${library.preferences.hideLivePreview ? "hidden" : ""}>${library.preferences.hideLivePreview ? "" : outputPreview(s.template, s)}</div></div>`
    }
    <div class="actions">${button("cancel-session", s.template.placeholderStyle === "source" ? "closeSession" : "cancelSession", "quiet danger")}</div>
  </main>`;
}

async function switchTemplateView(form: boolean) {
  const s = session!;
  await platform.compact(!form, library.preferences.alwaysOnTop);
  const shortcutError = await configureSessionShortcuts(!form);
  prepareWorkflow(s, form);
  typingCheck = false;
  reverification = null;
  templateForm = form;
  if (lastTemplate) lastTemplate.typing = form;
  preview = false;
  message = "";
  render();
  focus(form ? controlFocus(`form-field-${s.active}`) : "switch-form");
  if (!form && !s.fields[s.active]) focus("finish");
  if (shortcutError) report(shortcutError);
}
function sessionRecovery(s?: Session) {
  if (!lastTemplate) return "";
  const reuse =
    s &&
    !s.scanner &&
    s.template.id === lastTemplate.definition.id &&
    !library.preferences.clearAfterCompletion &&
    s.fields.some((field) => field.value !== null);
  return `<div class="actions">${button("restart-session", "restartSession")}${reuse ? button("reuse-session", "reuseSession") : ""}</div>`;
}
function activeScannerControl(s: Session, primary = false) {
  return `<div class="template-form-field">${fieldControl(s, s.active, "scanner-control", s.mode === "verify")}
    ${button("use-scanner-control", s.mode === "verify" ? "compare" : "apply", primary ? "primary" : "")}</div>`;
}
function selectedControl(id: string) {
  const element = document.getElementById(id);
  const input =
    element instanceof HTMLFieldSetElement
      ? element.querySelector<HTMLInputElement>("input:checked")
      : element;
  return input
    ? controlValue(
        input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
      )
    : "";
}
function deliveredSections(s: Session) {
  const parts = s.prepared!;
  return groupSections
    ? [
        {
          id: "group",
          label: t("allSections"),
          text: parts.map((part) => part.text).join("\n"),
        },
      ]
    : parts;
}
function sectionNavigation(
  s: Session,
  parts: NonNullable<Session["prepared"]>,
  index: number,
) {
  if (index === parts.length - 1 || groupSections) return false;
  const configured = parseSource(s.template.content).delivery.after.get(
    parts[index].id,
  );
  return configured ?? sectionTab;
}
function sectionDeliveryView(s: Session) {
  const parts = deliveredSections(s),
    index = s.deliveryIndex ?? 0;
  const navigation = sectionNavigation(s, parts, index);
  const keys =
    typeof navigation === "boolean"
      ? navigation
        ? "Tab"
        : ""
      : navigation.join(" → ");
  return `<main class="capture-panel focused-session">
    <div class="section-head"><h1>${esc(t("prepareSections"))}</h1>${button("pause-task", "pauseTask")}</div>
    ${s.prepared!.length > 1 ? check("group-sections", "groupSections", groupSections) : ""}${check("section-tab", "sectionTab", sectionTab)}
    ${parts.length > 1 ? `<label for="delivery-mode">${esc(t("deliveryMode"))}</label><select id="delivery-mode"><option value="step" ${deliveryMode === "step" ? "selected" : ""}>${esc(t("deliveryStep"))}</option><option value="sequence" ${deliveryMode === "sequence" ? "selected" : ""}>${esc(t("deliverySequence"))}</option></select>` : ""}
    <p role="status">${esc(parts[index].label)} · ${index + 1}/${parts.length}</p>
    ${parts.length > 1 && !s.deliveryDone ? `<p class="hint">${esc(t("afterSection"))} ${esc(keys || t("noNavigation"))}</p>` : ""}
    <pre class="output">${esc(parts[index].text)}</pre>
    <p class="hint">${esc(t("sectionDeliveryHelp"))} <kbd>${esc(library.preferences.shortcuts.finish)}</kbd></p>
    ${lastStepView()}
    <div class="toolbar">${button("copy-section", "copySection", "primary")}${button("save-sections", "saveSections")}</div>
    <div class="toolbar">${button("section-prev", "emailManualBack", "", index === 0 && !s.deliveryDone)}${button("section-next", "emailManualNext", "", index === parts.length - 1)}</div>
    <div class="actions">${button("section-edit", "editResponses")}${button("cancel-session", "closeSession")}</div>
  </main>`;
}
function freeScannerOutput(s: Session) {
  if (!s.scannerOutputTemplate) return s.fields[s.active]?.value ?? "—";
  const values = new Map(s.fields.map(({ name, value }) => [name, value]));
  return scannerTemplateParts(s.scannerOutputTemplate)
    .map(({ name, text }) => (name ? (values.get(name) ?? text) : text))
    .join("");
}
function freeScannerPreview(s: Session) {
  return `<aside class="scanner-preview sticky-preview free-scanner-preview" aria-labelledby="free-preview-heading">
    <h2 id="free-preview-heading">${esc(t(s.scannerOutputTemplate ? "outputPreview" : "capturedValue"))}</h2>
    <pre class="output" id="free-preview-value">${esc(freeScannerOutput(s))}</pre>
  </aside>`;
}

function focusSourceScanner() {
  if (session?.mode === "ready") return "finish";
  return !manualOpen && document.getElementById("scanner-control")
    ? controlFocus("scanner-control")
    : "manual-value";
}

function sourceScannerView(s: Session) {
  const field = s.fields[s.active];
  const checking = s.mode === "verify";
  const ready = s.mode === "ready";
  const active = activeSourceFields(s);
  const showPreview = !library.preferences.hideLivePreview;
  const status = (entry: Session["fields"][number]) =>
    esc(t(entry.status === "verified" ? "matchedSource" : entry.status));
  return `<main class="capture-panel source-scanner">
    <header class="scanner-header">
      <h1>${esc(s.template.name)}</h1>
      <p class="task-progress" role="status">${esc(progressText(s))}</p>
    </header>
    <div class="scanner-layout ${showPreview ? "" : "without-preview"}">
      <div class="scanner-work">
        <section class="scanner-current" aria-labelledby="active-task-heading">
          <h2 id="active-task-heading">${esc(ready ? t("nextOutput") : field ? fieldLabel(s, field.name) : t("noFields"))}</h2>
          ${field?.status === "mismatch" ? mismatchView(field.value!, field.candidate!) : ""}
          ${
            !ready && field
              ? `
            ${s.controls?.has(field.name) ? activeScannerControl(s, true) : ""}
            <details id="manual-entry" ${manualOpen || !s.controls?.has(field.name) ? "open" : ""}>
              <summary>${esc(t(s.controls?.has(field.name) ? "clipboard" : "manualEntry"))}</summary>
              <form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label>${manualValueEditor(s)}
              <div class="toolbar">${button("apply-value", checking ? "compare" : "apply", "primary")}${button("use-clipboard", "clipboard")}</div></form>
            </details>
            <div class="toolbar scanner-navigation">${button("previous", "previous")}${mouseMode ? button("mouse-transfer", checking ? "compareSelection" : "transfer", "", !desktop) : ""}${button("next", "next")}</div>`
              : `<div class="toolbar">${button("finish", "prepareSections", "primary")}</div>`
          }
        </section>
        <section class="scanner-fields" aria-labelledby="scanner-fields-heading">
          <h2 id="scanner-fields-heading">${esc(t("fields"))}</h2>
          <ol class="capture-fields" aria-label="${esc(t("fields"))}">
            ${s.fields
              .map((entry, index) =>
                fieldVisible(s, entry.name, active)
                  ? `
              <li><button id="field-${index}" data-field="${index}" class="capture-field ${index === s.active ? "active" : ""} ${library.preferences.verifiedBackground && entry.status === "verified" ? "verified-background" : ""}" ${index === s.active ? 'aria-current="step"' : ""}>
                <span class="field-body"><strong>${esc(fieldLabel(s, entry.name))}</strong>${entry.value !== null ? `<span class="field-value">${esc(entry.value)}</span>` : ""}</span>
                <span class="status-label">${status(entry)}</span>
              </button></li>`
                  : "",
              )
              .join("")}
          </ol>
        </section>
        <details id="task-tools" class="task-tools" ${taskToolsOpen ? "open" : ""}>
          <summary>${esc(t("scannerToolsLabel"))}</summary>
          <div class="toolbar">
            ${!checking && !ready ? button("verify-start", "verifyStart") : ""}
            ${s.fields.some((entry) => entry.value?.trim()) ? button("reverify-all", "reverifyAll") : ""}
            ${field?.value?.trim() ? button("reverify-field", "reverifyField") : ""}
            ${field ? button("clear", "clear", "", field.value === null) + button("clean-lines", "removeBlankLines", "", field.value === null) + button("skip", "skip") : ""}
          </div>
          <div class="toolbar">${check("mouse-mode", "mouseMode", mouseMode)}${check("preserve-clipboard", "preserveClipboard", preserveClipboard)}</div>
        </details>
        <div class="toolbar scanner-session-actions">
          ${button("switch-form", "fillForm", "quiet")}
          ${button("pause-task", "pauseTask", "quiet")}
          ${button("cancel-session", "closeSession", "quiet")}
        </div>
      </div>
      ${showPreview ? `<aside class="scanner-preview sticky-preview">${outputPreview(s.template, s)}</aside>` : ""}
    </div>
  </main>`;
}
function sessionView(): string {
  if (!session) return "";
  const s = session,
    p = library.preferences,
    f = s.fields[s.active];
  if (s.mode === "delivery" && s.prepared) return sectionDeliveryView(s);
  if (templateFormActive()) return templateFormView(s);
  if (s.template.placeholderStyle === "source") return sourceScannerView(s);
  if (focusedWorkflow && !["review", "complete"].includes(s.mode))
    return focusedSessionView(s);
  if (s.mode === "review")
    return `<main class="capture-panel"><h1>✓ ${esc(t(s.template.email?.enabled ? "emailDone" : "complete"))}</h1><p>${esc(t(s.template.email?.enabled ? "emailReviewHelp" : "extraFieldsReviewHelp"))}</p><div class="actions">${button("email-to-scanner", "emailToScanner", "primary")}${button("email-clear-close", "clearClose", "danger") + button("close-session", "closeSession")}</div>${!p.clearAfterCompletion ? outputPreview(s.template, s) + button("retain-email-results", "closeSession") : ""}${sessionRecovery(s)}</main>`;
  if (s.mode === "complete")
    return `<main class="capture-panel"><p class="eyebrow">${esc(t("app"))}</p><h1>✓ ${esc(t(s.template.email?.enabled ? "emailDone" : "complete"))}</h1><p>${esc(t(s.template.email?.enabled ? "emailFinished" : "copied"))}</p><p class="muted">${esc(t(p.clearAfterCompletion || !s.fields.some((f) => f.value !== null) ? "erased" : "retained"))}</p>${button("close-session", returnToScanner ? "returnScanner" : "closeSession", "primary")}${!p.clearAfterCompletion && !s.scanner && s.fields.some((f) => f.value !== null) ? outputPreview(s.template, s) + button("erase-results", "eraseSession", "quiet danger") : ""}${sessionRecovery(s)}</main>`;
  if (s.mode === "delivery") {
    const parts = renderEmail(s),
      index = s.deliveryIndex ?? 0;
    return `<main class="capture-panel"><div class="task-toolbar">${button("pause-task", "pauseTask")}${button("toggle-workflow", "focusedView")}</div><h1>${esc(t("emailDelivery"))}</h1><p class="hint">${esc(t("emailDeliveryHelp"))}</p><p role="status">${esc(t(parts[index].key))} · ${index + 1}/${parts.length}</p><pre class="output">${esc(parts[index].text)}</pre><p><kbd>${esc(p.shortcuts.finish)}</kbd> ${esc(t("emailPasteNext"))}</p><p><kbd>${esc(p.shortcuts.previous)}</kbd> ${esc(t("emailGoBack"))}</p><p class="hint">${esc(t("emailBackHelp"))}</p>${s.deliveryDone ? `<p role="status">${esc(t("emailBodyPasted"))}</p>` : ""}<div class="actions">${button("email-copy", "emailCopy")}${button("email-back", "emailManualBack", "", index === 0)}${button("email-next", "emailManualNext", "", !!s.deliveryDone)}${button("email-done", "emailDone", "primary", !s.deliveryDone)}${button("cancel-session", s.scanner ? "endScanner" : "cancelSession", "quiet danger")}</div></main>`;
  }
  const active = activeSourceFields(s);
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
  return `<main class="capture-panel ${s.scanner ? "scanner-panel" : ""}"><div class="section-head session-heading"><h1>${esc(s.scanner ? t("scanner") : s.template.name)}</h1>${!s.scanner ? button("switch-form", "fillForm") : ""}${button("toggle-workflow", "focusedView")}${button("pause-task", "pauseTask")}${button("session-back", s.scanner && library.preferences.showWorkspace ? "workspace" : "recentTemplates")}</div><p class="eyebrow" role="status">${esc(t(s.mode))} · ${done}/${s.fields.length}</p>
  ${s.scanner ? '<div class="scanner-layout free-scanner-layout"><div class="scanner-work">' : ""}
  ${s.scanner ? `<p class="vera-id">${esc(s.rowLink?.rowId ?? s.scannerId)}${s.rowLink ? `<br>${esc(s.rowLink.tableId)}` : ""}</p><p class="hint">${esc(t(s.rowLink ? "rowSaveHelp" : "scannerTemporary"))}</p>` : ""}
  ${f && s.controls?.has(f.name) ? activeScannerControl(s) : ""}
  ${s.mode !== "ready" && f ? `<details id="manual-entry" ${manualOpen ? "open" : ""}><summary>${esc(t("manualEntry"))}</summary><form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label>${manualValueEditor(s)}<div class="toolbar">${button("apply-value", mode === "verify" ? "compare" : "apply", "primary")}${button("use-clipboard", "clipboard")}</div></form>${!s.scanner ? `<p class="hint">${esc(t("clipboardHelp"))}</p>` : ""}</details>` : ""}
  ${mouseMode ? `<div class="toolbar">${button("mouse-back", "previous")}${button("mouse-transfer", "transfer", "primary", s.mode === "ready")}${button("mouse-forward", "next")}</div>` : ""}
  <details id="session-options" class="session-options" ${sessionOptionsOpen ? "open" : ""}><summary>${esc(t("sessionOptions"))}</summary><p class="hint">${esc(t(mode === "verify" ? "verifyHelp" : "captureHelp"))}</p><kbd>${esc(p.shortcuts[mode])}</kbd>
  ${s.mode !== "ready" ? check("preserve-clipboard", "preserveClipboard", preserveClipboard) + `<p class="hint">${esc(t("preserveClipboardHelp"))}</p>` : ""}
  ${check("mouse-mode", "mouseMode", mouseMode)}<p class="hint">${esc(t("mouseHelp"))}</p></details>
  ${s.scanner ? `<div class="section-head scanner-field-heading"><h2>${esc(t("scannerFields"))}</h2><div class="toolbar">${button("scanner-add", "addField")}<button id="scanner-reorder" aria-pressed="${scannerReordering}">${esc(t(scannerReordering ? "doneReordering" : "reorderFields"))}</button></div></div><p class="hint">${esc(t("scannerFieldsHelp"))}</p>` : ""}
  <ol class="capture-fields" aria-label="${esc(t("fields"))}">${s.fields.map((field, index) => (!fieldVisible(s, field.name, active) ? "" : `<li ${s.scanner ? `data-reorder="${index}"` : ""}><button id="field-${index}" data-field="${index}" class="capture-field ${p.verifiedBackground && field.status === "verified" ? "verified-background" : ""} ${index === s.active ? "active" : ""} ${field.status}" ${index === s.active ? 'aria-current="step"' : ""}><span class="state-icon" aria-hidden="true">${index === s.active ? "→" : symbols[field.status]}</span><span class="field-body"><strong>${esc(fieldLabel(s, field.name))}</strong><span class="field-value">${esc(field.value ?? "—")}</span></span><span class="status-label">${esc(t(field.status))}</span></button>${s.scanner && scannerReordering ? `<div class="scanner-field-tools">${dragHandle()}<span><button data-scanner-up="${index}" aria-label="${esc(t("moveUp") + " " + field.name)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-scanner-down="${index}" aria-label="${esc(t("moveDown") + " " + field.name)}" ${index === s.fields.length - 1 ? "disabled" : ""}>↓</button></span></div>` : ""}</li>`)).join("")}</ol>
  ${f ? `<details class="inspect"><summary>${esc(t("expand"))}: ${esc(fieldLabel(s, f.name))}</summary><pre>${esc(f.value ?? "—")}</pre></details>` : ""}
  ${f?.removeBlankLines ? `<p class="hint">${esc(t("blankLinesRemoved"))}</p>` : ""}
  ${f?.status === "mismatch" ? mismatchView(f.value!, f.candidate!) : ""}

  ${s.fields.some((field) => field.value !== null) ? `<details class="reverification"><summary>${esc(t("verifyAgain"))}</summary><div class="toolbar">${button("reverify-field", "reverifyField", "", !f || f.value === null)}${button("reverify-all", "reverifyAll")}</div><p class="hint">${esc(t("reverifyHelp"))}</p></details>` : ""}
  ${!s.scanner ? `<div class="toolbar navigation">${button("previous", "previous")}${button("next", "next")}${button("clear", "clear")}${button("clean-lines", "removeBlankLines", "", !f || f.value === null)}${button("skip", "skip")}</div>` : ""}
  ${s.scanner ? scannerControls() : s.mode === "ready" ? `<div class="actions">${button("preview", "preview")}${button("finish", s.template.email?.enabled ? "emailPrepare" : "finish", "primary")}</div>` : `<div class="actions">${button("verify-start", "verifyStart")}${!s.template.verificationEnabled ? button("finish", s.template.email?.enabled ? "emailPrepare" : "finish", "primary") : ""}</div>`}
  ${preview ? `<pre class="output">${esc(rendered)}</pre>` : !library.preferences.hideLivePreview && !s.scanner ? outputPreview(s.template, s) : ""}
  <details><summary>${esc(t("help"))}</summary><dl class="shortcut-list">${actions.map((a) => `<dt>${esc(t(a === "cancel" ? "cancelSession" : a))}</dt><dd><kbd>${esc(p.shortcuts[a])}</kbd></dd>`).join("")}</dl></details>
  <div class="actions">${button("cancel-session", s.scanner ? "endScanner" : "cancelSession", "quiet danger")}</div>${s.scanner ? `</div>${!p.hideLivePreview ? freeScannerPreview(s) : ""}</div>` : ""}</main>`;
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
      if (!focusedWorkflow) document.getElementById(action)?.click();
      else
        void run(async () => {
          if (action === "scanner-copy") {
            await copyTask(scannerValue(session!), session!.fields[index].name);
            notify("copied");
          } else if (action === "scanner-paste") {
            await pasteTask(
              scannerValue(session!),
              session!.fields[index].name,
              (text) => platform.pasteToSource(text),
            );
            notify("pasteRequested");
          } else if (action === "verify-start") {
            beginReverification(session!);
            reverification = "field";
            manualOpen = true;
            render();
            focus("manual-value");
          } else {
            await editScannerName(index);
            render();
            focus(`field-${index}`);
          }
        });
    } else if (e.target === menu) menu.close();
  });
}
function selectSessionField(index: number) {
  const s = session!;
  s.active = index;
  const keepChecking =
    (focusedWorkflow || reverification === "all") &&
    s.scanner &&
    s.mode === "verify" &&
    !!s.fields[index]?.value?.trim();
  if (keepChecking) reverification ??= "field";
  else {
    reverification = null;
    if (s.scanner) s.mode = "capture";
  }
  if (
    focusedWorkflow &&
    s.scanner &&
    (keepChecking || s.fields[index]?.value === null)
  )
    manualOpen = true;
}
function bindSession() {
  click("copy-section", async () => {
    const part = deliveredSections(session!)[session!.deliveryIndex ?? 0];
    await copyTask(part.text, part.label);
    notify("copied");
    await rememberOutput(session!, sectionText(session!.prepared!));
  });
  click("save-sections", async () => {
    const s = session!;
    if (await saveSectionText(deliveredSections(s)))
      await rememberOutput(s, sectionText(s.prepared!));
  });
  click("section-prev", () => perform("previous"));
  click("section-next", () => perform("next"));
  click("section-edit", async () => {
    await switchTemplateView(templateForm);
    delete session!.prepared;
    recordedOutputs.delete(session!);
  });
  on("group-sections", "change", (event) => {
    groupSections = (event.target as HTMLInputElement).checked;
    session!.deliveryIndex = 0;
    session!.deliveryDone = false;
    render();
    focus("group-sections");
  });
  on("delivery-mode", "change", (event) => {
    deliveryMode =
      (event.target as HTMLSelectElement).value === "sequence"
        ? "sequence"
        : "step";
  });
  on("section-tab", "change", (event) => {
    sectionTab = (event.target as HTMLInputElement).checked;
    render();
    focus("section-tab");
  });
  click("switch-form", () => switchTemplateView(true));
  click("switch-scanner", () => switchTemplateView(false));
  const restart = async (reuse: boolean) => {
    if (!lastTemplate) return;
    await launch(
      lastTemplate.definition,
      undefined,
      session?.mode === "complete" || (reuse && session?.mode === "review"),
      lastTemplate.typing,
      reuse ? (session ?? undefined) : undefined,
    );
  };
  click("restart-session", () => restart(false));
  click("reuse-session", () => restart(true));
  on("scanner-control", "keydown", (event) => {
    if (
      (event as KeyboardEvent).key !== "Enter" ||
      !(event.currentTarget instanceof HTMLFieldSetElement)
    )
      return;
    event.preventDefault();
    document.getElementById("use-scanner-control")?.click();
  });
  click("use-scanner-control", async () => {
    const value = selectedControl("scanner-control");
    await accept(value, true);
  });
  click("edit-responses", () => {
    typingCheck = false;
    message = "";
    render();
    focus(controlFocus(`form-field-${session!.active}`));
  });
  click("submit-typing-check", () => {
    const s = session!;
    if (!verify(s, selectedControl("typing-check")))
      throw Error("typingMismatch");
    typingCheck = s.mode === "verify";
    message = "";
    render();
    focus(typingCheck ? controlFocus("typing-check") : "finish");
  });
  if (templateFormActive() && !typingCheck) {
    const updatePreview = (s: Session) => {
      const active = activeSourceFields(s);
      if (active)
        root.querySelectorAll<HTMLElement>("[data-form-row]").forEach((row) => {
          row.hidden = !active.has(s.fields[Number(row.dataset.formRow)].name);
        });
      const previewPanel = document.getElementById("form-output");
      if (previewPanel && !previewPanel.hidden)
        previewPanel.innerHTML = outputPreview(s.template, s);
      const progress = root.querySelector(".template-form .task-progress");
      if (progress) progress.textContent = progressText(s);
    };
    root
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(".template-form [data-control]")
      .forEach((input) => {
        input.addEventListener("input", () => {
          const s = session!;
          const index = Number(input.dataset.control);
          const field = s.fields[index];
          s.active = index;
          const value = controlValue(input);
          if (
            value === (field.value ?? "") &&
            !input.hasAttribute("aria-invalid") &&
            !input.validity.badInput
          )
            return;
          try {
            if (input.validity.badInput) throw Error("invalidControlValue");
            if (value.length > 1024 * 1024 || value.includes("\0"))
              throw Error("invalidText");
            const layoutError = textLayoutError(
              s.controls?.get(field.name),
              value,
            );
            if (layoutError) throw Error(layoutError);
            if (value.trim()) capture(s, value, false);
            else clear(s);
          } catch (error) {
            clear(s);
            updatePreview(s);
            const label = document.getElementById(`form-state-${index}`)!;
            label.textContent = tr(
              error instanceof Error ? error.message : "invalidControlValue",
            );
            input.setAttribute("aria-invalid", "true");
            return;
          }
          input.removeAttribute("aria-invalid");
          manualDrafts.delete(`capture:${field.name}`);
          manualDrafts.delete(`verify:${field.name}`);
          reverification = null;
          if (
            [...(s.controls?.values() ?? [])].some(
              (control) => control.when?.name === field.name,
            )
          ) {
            render();
            focus(input.id);
          } else {
            updatePreview(s);
            document.getElementById(`form-state-${index}`)!.textContent = t(
              field.status,
            );
          }
          document.getElementById("notice")!.hidden = true;
          message = "";
        });
      });
  }
  const input = document.getElementById("manual-value") as
    HTMLInputElement | HTMLTextAreaElement | null;
  if (input) {
    const key = `${session!.mode}:${session!.fields[session!.active]?.name ?? ""}`;
    input.dataset.owner = String(taskGeneration);
    input.dataset.draftKey = key;
    input.value = manualDrafts.get(key) ?? "";
  }
  click("toggle-workflow", () => {
    focusedWorkflow = !focusedWorkflow;
    render();
    focus("toggle-workflow");
  });
  click("pause-task", () =>
    navigate(
      session?.template.placeholderStyle === "source" ? "recent" : "workspace",
    ),
  );
  on("task-tools", "toggle", (event) => {
    if ((event.target as HTMLElement).isConnected)
      taskToolsOpen = (event.target as HTMLDetailsElement).open;
  });
  bindScannerExtras();
  click("scanner-reorder", () => {
    scannerReordering = !scannerReordering;
    render();
    focus("scanner-reorder");
  });
  for (const scope of ["field", "all"] as const)
    click(`reverify-${scope}`, () => {
      beginReverification(session!, scope === "all");
      if (focusedWorkflow) manualOpen = true;
      reverification = scope;
      preview = false;
      message = "";
      render();
      focus(manualOpen ? "manual-value" : `field-${session!.active}`);
    });
  if (session?.scanner) {
    const moveField = (from: number, to: number) => {
      const s = session!;
      if (!s.fields[from] || !s.fields[to]) return;
      const selectedField = s.fields[s.active];
      const [field] = s.fields.splice(from, 1);
      s.fields.splice(to, 0, field);
      s.active = s.fields.indexOf(selectedField);
      render();
      focus(`field-${s.fields.indexOf(field)}`);
    };
    bindReorder(
      root.querySelector(".capture-fields"),
      moveField,
      () => !busy && scannerReordering,
    );
    for (const direction of ["up", "down"] as const)
      root
        .querySelectorAll<HTMLButtonElement>(`[data-scanner-${direction}]`)
        .forEach((el) => {
          el.onclick = () => {
            if (!busy) {
              const from = Number(
                el.dataset[direction === "up" ? "scannerUp" : "scannerDown"],
              );
              moveField(from, from + (direction === "up" ? -1 : 1));
            }
          };
        });
  }
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
    await copyTask(
      scannerValue(session!),
      session!.fields[session!.active].name,
    );
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
    const part = renderEmail(session!)[session!.deliveryIndex ?? 0];
    await copyTask(part.text, t(part.key));
    emailSteps.set(part.key, "stepCopied");
    render();
    await rememberOutput(session!, emailOutputText(session!));
  });
  click("email-done", async () => {
    if (!session?.deliveryDone) return;
    const s = session;
    s.mode = "review";
    await bindShortcuts(null, dispatch);
    await platform.active(true);
    await platform.compact(false, false);
    render();
    focus("email-to-scanner");
    await rememberOutput(s, emailOutputText(s));
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
    navigate(
      session?.scanner && library.preferences.showWorkspace
        ? "workspace"
        : "recent",
    ),
  );
  click("erase-results", () => {
    eraseSession(session!);
    render();
    focus("restart-session");
  });
  click("retain-email-results", async () => {
    session!.mode = "complete";
    await closeSession();
  });
  click("close-session", () => requestSessionClose(session!, false));
  root.querySelectorAll<HTMLButtonElement>("[data-field]").forEach(
    (el) =>
      (el.onclick = () =>
        void run(() => {
          selectSessionField(Number(el.dataset.field));
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
    const input = document.getElementById("manual-value") as
      HTMLInputElement | HTMLTextAreaElement;
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
    reverification = null;
    if (session!.scanner) {
      if (session!.fields[session!.active].value === null)
        throw Error("noValue");
      beginReverification(session!);
      reverification = "field";
    } else beginVerification(session!);
    if (focusedWorkflow) manualOpen = true;
    message = "";
    render();
    focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
  });
  click("preview", () => {
    message = "";
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
    const input = document.getElementById("manual-value") as
      HTMLInputElement | HTMLTextAreaElement;
    input.value = session!.fields[session!.active].value ?? "";
    focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
  });
}
async function accept(
  value: string,
  advance = library.preferences.autoAdvance,
) {
  if (!session || paused) return;
  const activeName = session.fields[session.active]?.name ?? "";
  const submittedDraftKey = `${session.mode}:${activeName}`;
  const wasChecking = session.mode === "verify";
  if (value.length > 1024 * 1024) throw new Error("invalidText");
  if (session.mode !== "verify") reverification = null;
  if (session.mode === "verify") {
    const scope = reverification;
    const matches = verify(
      session,
      value,
      scope === "all"
        ? true
        : scope === "field" || session.scanner
          ? false
          : advance,
    );
    if (matches && scope === "field") {
      reverification = null;
      if (session.scanner)
        session.mode = session.fields.every(
          (f) => f.status === "verified" || f.status === "skipped",
        )
          ? "ready"
          : "capture";
      else prepareWorkflow(session, false);
    } else if (["ready", "capture"].includes(session.mode as Session["mode"]))
      reverification = null;
  } else if (session.scanner) captureScanner(session, value, advance);
  else capture(session, value, advance);
  if (session.scanner && session.mode === "ready") session.mode = "capture";
  if (
    focusedWorkflow &&
    session.scanner &&
    session.mode !== "verify" &&
    session.fields[session.active]?.value !== null
  )
    manualOpen = false;
  lastStep = {
    key: wasChecking
      ? session.fields.find((f) => f.name === activeName)?.status === "verified"
        ? "stepMatched"
        : "stepMismatch"
      : "stepCaptured",
    name: fieldLabel(session, activeName),
  };
  const input = document.getElementById("manual-value") as
    HTMLInputElement | HTMLTextAreaElement | null;
  manualDrafts.delete(submittedDraftKey);
  if (input?.dataset.draftKey === submittedDraftKey) input.value = "";
  message = "";
  preview = false;
  render();
  focus(
    session.template.placeholderStyle === "source"
      ? focusSourceScanner()
      : session.mode === "ready"
        ? "finish"
        : manualOpen
          ? "manual-value"
          : focusedWorkflow &&
              session.scanner &&
              session.fields[session.active]?.status === "verified"
            ? "scanner-copy"
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
  if (view !== "session" || paused || (global && templateFormActive())) return;
  if (s.mode === "review") return;
  if (s.mode === "delivery" && s.prepared && action !== "cancel") {
    const parts = deliveredSections(s),
      index = s.deliveryIndex ?? 0;
    if (action === "previous") {
      s.deliveryIndex = s.deliveryDone ? index : Math.max(0, index - 1);
      s.deliveryDone = false;
    } else if (action === "next") {
      s.deliveryIndex = Math.min(index + 1, parts.length - 1);
      s.deliveryDone = false;
    } else if (action === "finish" && global && !s.deliveryDone) {
      const sequence = deliveryMode === "sequence" && index < parts.length - 1;
      const target = sequence ? await platform.deliveryTarget() : undefined;
      const end = sequence ? parts.length : index + 1;
      let transferred = false;
      try {
        for (let current = index; current < end; current++) {
          await pasteTask(parts[current].text, parts[current].label, (text) =>
            platform.deliver(
              text,
              sectionNavigation(s, parts, current),
              target,
            ),
          );
          transferred = true;
          s.deliveryIndex = Math.min(current + 1, parts.length - 1);
          s.deliveryDone = current === parts.length - 1;
        }
      } finally {
        if (transferred) await rememberOutput(s, sectionText(s.prepared));
      }
    } else return;
    message = "";
    render();
    return;
  }
  if (s.mode === "delivery" && action !== "cancel") {
    const part = renderEmail(s)[s.deliveryIndex ?? 0];
    if (action === "next" && !s.deliveryDone) {
      if (!s.deliveryDone && !emailSteps.has(part.key))
        emailSteps.set(part.key, "stepManual");
      lastStep = { key: "stepManual", name: t(part.key) };
    }
    if (!global && (action === "previous" || action === "next")) {
      moveEmailSection(s, action === "previous" ? -1 : 1);
    } else if (global && action === "next") {
      moveEmailSection(s, 1);
    } else if (global && (action === "previous" || action === "finish")) {
      if (action === "finish" && s.deliveryDone) return;
      await deliverEmailSection(s, action === "previous", async (text, tab) => {
        if (text === null) {
          await platform.deliver(null, tab);
          return;
        }
        emailSteps.set(part.key, "stepPasteUncertain");
        await pasteTask(text, t(part.key), (value) =>
          platform.deliver(value, tab),
        );
        emailSteps.set(part.key, "stepPaste");
        await rememberOutput(s, emailOutputText(s));
      });
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
      if (s.mode === "ready") {
        beginReverification(s);
        reverification = "field";
        break;
      }
      if (s.scanner && s.mode !== "verify") {
        if (s.fields[s.active].value === null) throw Error("noValue");
        beginReverification(s);
        reverification = "field";
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
      selectSessionField(s.active);
      break;
    case "next":
      move(s, 1);
      selectSessionField(s.active);
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
      await requestSessionClose(s, true);
      return;
    case "finish": {
      if (
        templateFormActive() &&
        root.querySelector(
          '.template-form [data-form-row]:not([hidden]) [aria-invalid="true"]',
        )
      )
        throw Error("invalidControlValue");
      if (templateFormActive() && verificationRequired(s)) {
        beginVerification(s);
        if (s.mode === "verify") {
          typingCheck = true;
          message = "";
          render();
          focus(controlFocus("typing-check"));
          return;
        }
      }
      if (s.scanner) {
        const value = scannerValue(s);
        if (scannerOutput === "copy")
          await copyTask(value, s.fields[s.active].name);
        else if (!global) throw Error("scannerFocusHelp");
        else
          await pasteTask(value, s.fields[s.active].name, (text) =>
            platform.deliver(text, scannerOutput === "tab"),
          );
        if (library.preferences.autoAdvance && s.fields.length > 1) move(s, 1);
        s.mode = "capture";
        render();
        return;
      }
      if (s.template.placeholderStyle === "source") {
        const parts = prepareSections(s);
        const shortcutError = await configureSessionShortcuts(true);
        await platform.compact(true, library.preferences.alwaysOnTop);
        s.prepared = parts;
        s.mode = "delivery";
        s.deliveryIndex = 0;
        s.deliveryDone = false;
        message = "";
        render();
        focus("copy-section");
        if (shortcutError) report(shortcutError);
        return;
      }
      if (s.template.email?.enabled) {
        renderEmail(s);
        const shortcutError = templateFormActive()
          ? await configureSessionShortcuts(true)
          : undefined;
        await platform.compact(true, library.preferences.alwaysOnTop);
        s.mode = "delivery";
        s.deliveryIndex = 0;
        s.deliveryDone = false;
        emailSteps.clear();
        message = "";
        render();
        if (shortcutError) report(shortcutError);
        return;
      }
      const output = renderSession(s);
      await copyTask(output, t("finish"));
      if (s.template.extraFields?.length) s.mode = "review";
      else if (library.preferences.clearAfterCompletion) {
        eraseSession(s);
        manualDrafts.clear();
        taskGeneration++;
      } else s.mode = "complete";
      preview = false;
      await bindShortcuts(null, dispatch);
      await platform.active(s.mode === "review");
      await platform.compact(false, false);
      notify("copied");
      await rememberOutput(s, output);
      return;
    }
  }
  preview = false;
  message = "";
  render();
  focus(manualOpen ? "manual-value" : `field-${session?.active ?? 0}`);
}
function sectionText(parts: NonNullable<Session["prepared"]>) {
  return parts.length === 1
    ? parts[0].text
    : parts.map((part) => `${part.label}\n${part.text}`).join("\n\n");
}
function emailOutputText(s: Session) {
  return renderEmail(s)
    .map((part) => `${t(part.key)}\n${part.text}`)
    .join("\n\n");
}
function saveSectionText(parts: NonNullable<Session["prepared"]>) {
  return platform.exportTemplates(sectionText(parts), "veraflow-output.txt");
}
async function requestSessionClose(s: Session, confirmDiscard: boolean) {
  if (s.template.placeholderStyle === "source") {
    if (!(await saveBeforeClose(s))) return;
  } else {
    let text: string | undefined;
    if (
      !s.scanner &&
      (s.fields.length === 0 || s.fields.some((field) => field.value !== null))
    ) {
      try {
        text = s.template.email?.enabled
          ? emailOutputText(s)
          : renderSession(s);
      } catch {
        // The existing discard prompt handles unfinished legacy sessions.
      }
    }
    if (text !== undefined) {
      const choice = await actionDialog(
        "closeSourceTitle",
        "",
        `<button value="no" autofocus>${esc(t("keep"))}</button>
        <button value="discard" class="danger">${esc(t("closeWithoutSaving"))}</button>
        <button value="text" class="primary">${esc(t("saveSections"))}</button>`,
      );
      if (choice === "text") {
        if (!(await platform.exportTemplates(text, "veraflow-output.txt")))
          return;
        await rememberOutput(s, text);
      } else if (choice !== "discard") return;
    } else if (confirmDiscard && !(await confirmAction("sessionConfirm")))
      return;
  }
  await closeSession();
}
async function saveBeforeClose(s: Session) {
  let parts: Session["prepared"];
  try {
    if (
      !root.querySelector(
        '.template-form [data-form-row]:not([hidden]) [aria-invalid="true"]',
      )
    )
      parts = s.prepared ? deliveredSections(s) : prepareSections(s);
  } catch {
    // Unfinished responses can still be saved as an editable template.
  }
  const choice = await actionDialog(
    "closeSourceTitle",
    `<p>${esc(t(parts ? "closeSourceHelp" : "closeSourceIncomplete"))}</p>`,
    `<button value="no" autofocus>${esc(t("keep"))}</button>
     <button value="discard" class="danger">${esc(t("closeWithoutSaving"))}</button>
     <button value="text" ${parts ? "" : "disabled"}>${esc(t("saveSections"))}</button>
     <button value="prefilled" class="primary">${esc(t("savePrefilled"))}</button>`,
  );
  if (choice === "discard") return true;
  if (choice === "text" && parts) {
    const saved = await saveSectionText(parts);
    if (saved) await rememberOutput(s, sectionText(s.prepared ?? parts));
    return saved;
  }
  if (choice === "prefilled") {
    const content = prefillSource(
      s.template.content,
      new Map(
        s.fields.map((field) => [
          field.name,
          field.status === "skipped" ? "" : field.value,
        ]),
      ),
      s.typing ? "form" : "scanner",
      s.template.name.slice(0, 250).trim(),
    );
    return platform.exportTemplates(content, "prefilled-template.veraflow");
  }
  return false;
}
async function closeSession() {
  const wasScanner = session?.scanner;
  const wasSource = session?.template.placeholderStyle === "source";
  const keepResults =
    session?.mode === "complete" && !wasScanner && !returnToScanner;
  if (
    session?.template.placeholderStyle === "source" &&
    lastTemplate?.definition.id === session.template.id &&
    parseSource(lastTemplate.definition.content).responses.size
  )
    lastTemplate = null;
  if (!keepResults) {
    if (session) eraseSession(session);
    session = null;
  }
  paused = false;
  taskGeneration++;
  manualDrafts.clear();
  lastStep = null;
  emailSteps.clear();
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
  } else
    await navigate(
      wasScanner ? "workspace" : wasSource ? "recent" : "templates",
    );
}
async function confirmAction(
  key: Key,
  detail = "",
  actionText?: string,
): Promise<boolean> {
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
  return (
    (await actionDialog(
      key,
      detail ? `<pre>${esc(detail)}</pre>` : "",
      `<button value="no" autofocus>${esc(t("keep"))}</button><button value="yes" class="${["deleteConfirm", "discardConfirm", "sessionConfirm", "quitConfirm", "skipConfirm", "removeFieldConfirm"].includes(key) ? "danger" : "primary"}">${esc(actionText ?? t(action))}</button>`,
    )) === "yes"
  );
}
async function actionDialog(title: Key, body: string, actions: string) {
  await platform.reveal();
  const prior = document.activeElement as HTMLElement | null;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "confirmation-title");
  dialog.innerHTML = `<form method="dialog"><h2 id="confirmation-title">${esc(t(title))}</h2>${body}<div class="actions">${actions}</div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise<string>((resolve) =>
    dialog.addEventListener(
      "close",
      () => {
        const choice = dialog.returnValue;
        dialog.remove();
        prior?.focus();
        resolve(choice);
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
// Native paste events supply plain text directly, without clipboard-read permission.
window.addEventListener("paste", (event) => {
  if (
    view !== "session" ||
    !session ||
    busy ||
    document.querySelector("dialog[open]") ||
    !["capture", "verify", "ready"].includes(session.mode)
  )
    return;
  const target = event.target as HTMLElement;
  if (target instanceof HTMLInputElement && target.type === "text") {
    const index =
      target.id === "manual-value"
        ? session.active
        : Number(target.dataset.control);
    const field = session.fields[index];
    const value = event.clipboardData?.getData("text/plain");
    const error =
      field &&
      value &&
      textLayoutError(session.controls?.get(field.name), value);
    if (error) {
      event.preventDefault();
      const status = document.getElementById(`form-state-${index}`);
      if (status && templateFormActive()) status.textContent = t(error);
      else void run(() => notify(error, true));
      return;
    }
  }
  if (
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable=false])",
    )
  )
    return;
  const field = target.closest<HTMLElement>("[data-field]");
  if (!field || !event.clipboardData?.types.includes("text/plain")) return;
  event.preventDefault();
  const index = Number(field.dataset.field);
  const value = event.clipboardData.getData("text/plain");
  void run(async () => {
    if (!session?.fields[index]) return;
    session.active = index;
    await accept(value);
  });
});
window.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.isComposing ||
    busy ||
    document.querySelector("dialog[open]")
  )
    return;
  if (view === "session" && templateFormActive()) return;
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
        const index = Number(fieldButton.dataset.field);
        await copyTask(
          scannerValue({ ...session!, active: index }),
          session!.fields[index].name,
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
        selectSessionField(next);
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
          document.getElementById("manual-value") as
            HTMLInputElement | HTMLTextAreaElement
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
  focusedWorkflow =
    layoutOverride === null
      ? library.preferences.focusedWorkflow === true
      : layoutOverride === "focused";
  if (library.preferences.showWorkspace) view = "workspace";
  recentDocuments = await platform.recentDocuments().catch(() => []);
  if (library.templates[0]) selectTemplate(library.templates[0].id);
  render();
  if (desktop && !testBuild) {
    const checkInBackground = () => {
      if (!busy && !quitting)
        void checkAvailableUpdate().catch(() => {
          // Settings offers a manual retry.
        });
    };
    checkInBackground();
    window.setInterval(checkInBackground, 60 * 60 * 1000);
  }
  await platform.tray(
    (action) =>
      void run(async () => {
        if (action === "quit") {
          if (
            session?.template.placeholderStyle === "source" &&
            session.mode !== "complete"
          ) {
            if (dirty && !(await confirmAction("discardConfirm"))) return;
            if (!(await saveBeforeClose(session))) return;
          } else if (
            (privateWork() || dirty) &&
            !(await confirmAction(session ? "quitConfirm" : "discardConfirm"))
          )
            return;
          if (session) eraseSession(session);
          manualDrafts.clear();
          taskGeneration++;
          eraseRetainedScanner();
          await bindShortcuts(null, dispatch);
          await platform.active(false);
          quitting = true;
          await platform.quit();
        } else if (action === "update") await updateApp();
        else if (action === "open") await pickDocument();
        else if (action === "outputs") await navigate("outputs");
        else if (action.startsWith("recent-"))
          await openDocument(
            await platform.openRecentDocument(Number(action.slice(7))),
          );
        else if (action === "settings") await navigate("settings");
        else if (action === "session" && session) await navigate("session");
        else await navigate("recent");
      }),
  );
  try {
    await refreshTrayMenu();
    await platform.documentEvents(() => {
      documentsPending = true;
      void drainDocuments();
    });
  } catch (error) {
    report(error);
  }
}
void init();
