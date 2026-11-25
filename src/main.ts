import type { TemplateContext } from "./core/variables";
import { compareSourceText } from "./core/batch";
import {
  candidateFields,
  candidateFile,
  extractCandidates,
  extractionFields,
  importCandidateFile,
  validSourceText,
  sourceTextLimit,
  candidateFileLimit,
  type Candidate,
} from "./core/candidates";
import {
  recordValues,
  planRecordMerge,
  planRecordValues,
  selectedSourceOutput,
  sourceFilename,
} from "./core/source-record";
import { shortcutAccelerator, shortcutLabel } from "./core/shortcuts";
import { normalizeText, textLayoutError } from "./core/form";
import {
  parseSource,
  SourceSyntaxError,
  prefillSource,
  sourceDefinitionText,
  sourceOutput,
  sourceParts,
  type DeliveryMode,
  type SourceWorkflow,
} from "./core/source";
import {
  csvRecords,
  csvRecord,
  planCSVAppend,
  delimitedRow,
  spreadsheetText,
  type CSVRecords,
} from "./core/csv";
import { sessionProgress } from "./core/progress";
import { bindReorder } from "./reorder";
import { formDialog, type Input } from "./form-dialog";
import {
  fieldNames,
  veraId,
  validateWorkspace,
  exportScanner,
  importScanner,
  scannerTemplateParts,
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
  activateFormStep,
  applyRecordChanges,
  currentFormStep,
  sessionSteps,
  noteStepPrepared,
  noteStepTransfer,
  prepareSections,
  fieldRequiresVerification,
  formAttention,
  spreadsheetRow,
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
  type CSVAppendDestination,
  type FolderListing,
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
  "recent" | "outputs" | "scanner" | "templates" | "settings" | "session" =
  "recent";
let templateFolder: FolderListing | null = null;
let recentDocuments: RecentDocument[] = [];
let outputLabels: OutputLabel[] = [];
let selectedOutput: { index: number; text: string } | null = null;
// Track the latest text per session to avoid duplicates across prepare, copy, and export.
let recordedOutputs = new WeakMap<Session, string>();
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
let pasteOptionsOpen = false;
let sectionOrderOpen = false;
let pasteOrder: number[] | null = null;
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

const macKeyboard = /Mac/i.test(navigator.platform);
const keyLabel = (binding: string) => shortcutLabel(binding, macKeyboard);

type SessionSlot = "template" | "freeScanner" | "snippet";
const parkedSessions = new Map<
  SessionSlot,
  {
    session: Session;
    retained: Session | null;
    restore: () => void;
  }
>();

function sessionSlot(s: Session): SessionSlot {
  if (isSnippetCollection(s)) return "snippet";
  return s.scanner || s.template.id === "scanner" ? "freeScanner" : "template";
}

function rememberManualDraft() {
  const input = document.getElementById("manual-value") as
    HTMLInputElement | HTMLTextAreaElement | null;
  if (input?.dataset.owner === String(taskGeneration))
    manualDrafts.set(input.dataset.draftKey!, input.value);
}

function parkCurrentSession() {
  if (!session) return;
  rememberManualDraft();
  const drafts = [...manualDrafts];
  const steps = [...emailSteps];
  const options = {
    typingCheck,
    groupSections,
    pasteOptionsOpen,
    sectionOrderOpen,
    pasteOrder,
    sectionTab,
    deliveryMode,
    lastTemplate,
    templateForm,
    lastStep,
    retainedScanner,
    returnToScanner,
    scannerOutput,
    manualOpen,
    sessionOptionsOpen,
    scannerMoreOpen,
    taskToolsOpen,
    scannerReordering,
    reverification,
    mouseMode,
    preserveClipboard,
    focusedWorkflow,
    preview,
  };
  parkedSessions.set(sessionSlot(session), {
    session,
    retained: retainedScanner,
    restore: () => {
      ({
        typingCheck,
        groupSections,
        pasteOptionsOpen,
        sectionOrderOpen,
        pasteOrder,
        sectionTab,
        deliveryMode,
        lastTemplate,
        templateForm,
        lastStep,
        retainedScanner,
        returnToScanner,
        scannerOutput,
        manualOpen,
        sessionOptionsOpen,
        scannerMoreOpen,
        taskToolsOpen,
        scannerReordering,
        reverification,
        mouseMode,
        preserveClipboard,
        focusedWorkflow,
        preview,
      } = options);
      manualDrafts.clear();
      for (const [key, value] of drafts) manualDrafts.set(key, value);
      emailSteps.clear();
      for (const [key, value] of steps) emailSteps.set(key, value);
    },
  });
  retainedScanner = null;
}

async function resumeParkedSession(slot: SessionSlot) {
  const parked = parkedSessions.get(slot);
  if (!parked || !(await abandonDraft())) return;
  await platform.mouseSource(false);
  parkCurrentSession();
  parkedSessions.delete(slot);
  session = parked.session;
  taskGeneration++;
  parked.restore();
  paused = true;
  await navigate("session");
}

function openSessionBar() {
  if (view !== "session" && !parkedSessions.size) return "";
  const parked = [...parkedSessions]
    .map(
      ([slot, entry]) =>
        `<button id="resume-slot-${slot}" class="quiet">${esc(taskName(entry.session))}</button>`,
    )
    .join("");
  return `<nav class="open-session-bar" aria-label="${esc(t("openSessions"))}">${view === "session" ? button("session-home", "sessionHome", "quiet") : ""}${parked}</nav>`;
}

function privateWork() {
  return (
    !!document.querySelector("dialog[open]") ||
    !!retainedScanner ||
    [...parkedSessions.values()].some(
      ({ session }) => session.mode !== "complete",
    ) ||
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
function isSnippetCollection(s: Session) {
  return (
    s.template.placeholderStyle === "source" &&
    parseSource(s.template.content).snippets
  );
}

let watchingSource = false;
let mousePolling = false;
setInterval(async () => {
  if (mousePolling) return;
  const enabled =
    mouseMode &&
    view === "session" &&
    !paused &&
    !!session &&
    (session.unifiedForm || !templateFormActive()) &&
    (["capture", "verify"].includes(session.mode) ||
      (session.unifiedForm && session.mode === "ready") ||
      isSnippetCollection(session));
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
      ? `${t("shortcutFailed")} ${t(error.action === "cancel" ? "cancelSession" : error.action)}: ${keyLabel(error.shortcut)}`
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
  rememberManualDraft();
  applyAppearance();
  root.className = view === "session" && !templateFormActive() ? "compact" : "";
  root.innerHTML = `${view !== "session" ? `<header class="appbar"><span class="wordmark">VeraFlow <span lang="zh-CN">核流</span></span><nav aria-label="${esc(t("app"))}">${view !== "settings" && availableUpdate && !testBuild ? button("update-recent", "updateApp", "primary") : ""}${view !== "recent" ? button("nav-recent", "recentForms") : ""}${button("nav-settings", "settings", view === "settings" ? "selected" : "")}</nav></header>` : ""}
    ${testBuild ? `<aside class="preview-banner" role="status">${esc(t("testBuildNotice"))} · ${esc(appVersion)} · ${esc(buildCommit)}</aside>` : ""}
    ${!desktop ? `<aside class="preview-banner">${esc(t("browserPreview"))}</aside>` : ""}
    <div id="notice" role="${failure ? "alert" : "status"}" class="notice ${failure ? "error" : "success"}" ${message ? "" : "hidden"}>${esc(message)}</div>
    ${openSessionBar()}
    ${paused && session && view !== "session" ? pausedTaskView() : ""}
    ${view === "recent" ? recentView() : view === "outputs" ? outputsView() : view === "scanner" ? scannerHome() : view === "templates" ? libraryView() : view === "settings" ? settingsView() : sessionView()}
    ${view !== "session" ? `<footer>${view !== "recent" ? button("nav-scanner", layoutOverride === null ? "createForm" : "freeScanner") : ""}${session && !(paused && focusedWorkflow) ? button("nav-session", session.mode === "complete" ? "sessionResults" : "session") : ""}<span>◉ ${esc(t("localOnly"))}</span><span>${esc(t("localNote"))}</span><span class="app-version">VeraFlow ${esc(appVersion)}</span></footer>` : ""}`;
  click("session-home", () => navigate("recent"));
  for (const slot of parkedSessions.keys())
    click(`resume-slot-${slot}`, () => resumeParkedSession(slot));
  click("nav-scanner", () =>
    parkedSessions.has("freeScanner")
      ? resumeParkedSession("freeScanner")
      : navigate(session?.scanner ? "session" : "scanner"),
  );
  click("start-scanner", () => setupScanner());
  click("import-scanner-home", () => loadScannerJSON());
  click("open-legacy-library", () => navigate("templates"));
  click("update-recent", updateApp);
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
    t(layoutOverride === null ? "createForm" : "freeScanner"),
    [
      { key: "fields", label: t("fieldLines"), lines: true },
      { key: "output", label: t("scannerTemplate"), lines: true },
      ...(layoutOverride === null
        ? [
            {
              key: "verifyDefault",
              label: t("formVerificationDefault"),
              check: true,
              value: String(library.preferences.verificationDefault),
            },
          ]
        : []),
    ],
    t(layoutOverride === null ? "startAdHocForm" : "startScanner"),
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
  const s = startScanner(
    library.preferences,
    t(layoutOverride === null ? "adHocForm" : "freeScanner"),
    names[0],
  );
  if (layoutOverride === null)
    s.template.verificationEnabled = input.verifyDefault === "true";
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
      t(layoutOverride === null ? "adHocForm" : "freeScanner"),
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
        return copyFieldValue(s, index);
      })
      .join("");
    if (!text.trim()) throw Error("noValue");
    await copyTask(text, t("copyTemplate"));
    notify("copied");
  });
}

function scannerHome(): string {
  return `<main class="settings scanner-home"><h1>${esc(t(layoutOverride === null ? "createForm" : "scanner"))}</h1><p>${esc(t(layoutOverride === null ? "createFormIntro" : "scannerIntro"))}</p>${button("start-scanner", "defineFields", "primary")}${button("import-scanner-home", layoutOverride === null ? "importFormFields" : "importScanner")}<p class="hint">${esc(t("scannerPrivacy"))}</p></main>`;
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
  session.unifiedForm = layoutOverride === null;
  if (session.unifiedForm) {
    templateForm = true;
    prepareWorkflow(session, true);
  }
  scannerMoreOpen = false;
  scannerReordering = false;
  taskToolsOpen = false;
  manualOpen = true;
  scannerOutput = "copy";
  if (session.mode === "verify") reverification = "all";
  render();
  focus(
    session.unifiedForm
      ? controlFocus(`form-field-${session.active}`)
      : session.mode === "verify"
        ? "manual-value"
        : `field-${session.active}`,
  );
}
function scannerControls(secondaryOnly = false): string {
  const s = session!;
  if (s.unifiedForm)
    return `<section class="form-tools-body">
    ${check("custom-verify-default", "formVerificationDefault", s.template.verificationEnabled)}
    <label for="scanner-output-template">${esc(t("scannerTemplate"))}</label>
    <textarea id="scanner-output-template" rows="3">${esc(s.scannerOutputTemplate ?? "")}</textarea>
    <div id="scanner-template-match" class="template-match" aria-live="polite"></div>
    <div class="toolbar">${button("scanner-add-missing", "addMissing")}${button("scanner-copy-template", "copyTemplate")}</div>
    <div class="toolbar">${button("scanner-import", "importFormFields")}${button("scanner-export-fields", "exportScannerFields")}${button("scanner-export-values", "exportScannerValues")}${button("scanner-remove", "removeField", "quiet danger", s.fields.length === 1)}</div>
  </section>`;
  return `<section class="scanner-tools" aria-label="${esc(t("scanner"))}">
    <div class="scanner-bottom-actions"><div class="toolbar">
      ${secondaryOnly ? "" : (s.mode === "verify" ? "" : button("verify-start", "verifyStart")) + button("scanner-copy", "copyField", "primary") + button("scanner-paste", "pasteToApp", "", !desktop)}
    </div><div class="toolbar">${button("scanner-capture-mode", "scannerNewValue")}${button("scanner-rename", "renameField")}</div></div>
    <${secondaryOnly ? "div" : "details"} id="scanner-more" class="scanner-template-panel" ${scannerMoreOpen ? "open" : ""}>${secondaryOnly ? "" : `<summary>${esc(t("scannerMore"))}</summary>`}<h2>${esc(t("scannerTemplate"))}</h2><label for="scanner-output-template">${esc(t("scannerTemplate"))}</label><textarea id="scanner-output-template" rows="3">${esc(s.scannerOutputTemplate ?? "")}</textarea><div id="scanner-template-match" class="template-match" aria-live="polite"></div><div class="toolbar">${button("scanner-add-missing", "addMissing")}${button("scanner-copy-template", "copyTemplate")}</div><h2>${esc(t("scannerOutput"))}</h2><label for="scanner-output">${esc(t("scannerOutput"))}</label><select id="scanner-output"><option value="copy" ${scannerOutput === "copy" ? "selected" : ""}>${esc(t("copyField"))}</option><option value="paste" ${scannerOutput === "paste" ? "selected" : ""}>${esc(t("pasteField"))}</option><option value="tab" ${scannerOutput === "tab" ? "selected" : ""}>${esc(t("pasteTab"))}</option></select><p class="hint">${esc(t("scannerFocusHelp"))} <kbd>${esc(keyLabel(library.preferences.shortcuts.finish))}</kbd> ${esc(t("mousePasteHelp"))}</p><h2>${esc(t("useTemplate"))}</h2><label for="scanner-template">${esc(t("templates"))}</label><select id="scanner-template">${library.templates.map((tpl) => `<option value="${esc(tpl.id)}">${esc(tpl.name)}</option>`).join("")}</select>${check("scanner-keep", "keepScanner", false)}<p class="hint">${esc(t("scannerMatchHelp"))}</p>${button("scanner-apply", "useTemplate", "", !library.templates.length)}<h2>JSON</h2><div class="toolbar">${button("scanner-import", "importScanner")}${button("scanner-export-fields", "exportScannerFields")}${button("scanner-export-values", "exportScannerValues")}</div><h2>${esc(t("scannerFields"))}</h2><div class="toolbar">${button("clear", "clear")}${button("clean-lines", "removeBlankLines", "", s.fields[s.active]?.value === null)}${button("skip", "skip")}${button("scanner-remove", "removeField", "quiet danger", s.fields.length === 1)}</div></${secondaryOnly ? "div" : "details"}>
  </section>`;
}

function formatHistoryTime(time: number) {
  return new Intl.DateTimeFormat(library.preferences.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}

function recentView() {
  return `<main class="settings recent-documents"><div class="section-head"><h1>${esc(t("recentForms"))}</h1><div class="toolbar">${button("nav-scanner", layoutOverride === null ? "createForm" : "freeScanner")}${button("open-outputs", "recentOutputs")}${button("open-folder", "openFolder")}${button("open-document", "openDocument", "primary")}</div></div>
    ${templateFolderView()}
    ${recentDocuments.length ? `<ul class="recent-list">${recentDocuments.map((item, index) => `<li><button class="template-item" data-recent="${index}"><strong>${esc(item.title)}</strong><span>${item.file ? esc(item.file) + " · " : ""}${esc(formatHistoryTime(item.time))}</span></button></li>`).join("")}</ul>${button("clear-recent", "clearRecent", "quiet")}` : `<p>${esc(t("recentEmpty"))}</p>`}
    ${!session && lastTemplate ? sessionRecovery() : ""}</main>`;
}
function templateFolderView() {
  if (!templateFolder) return "";
  return `<section class="template-folder" aria-labelledby="folder-heading">
    <div class="section-head"><h2 id="folder-heading">${esc(templateFolder.name)}</h2><div class="toolbar">${button("refresh-folder", "refreshFolder", "quiet")}${button("close-folder", "closeFolder", "quiet")}</div></div>
    ${
      templateFolder.files.length
        ? `${field("folder-search", "searchTemplates", "", 'type="search"')}<ul class="recent-list folder-list">${templateFolder.files
            .map(
              (path, index) =>
                `<li><button class="template-item" data-folder-template="${index}">${esc(path)}</button></li>`,
            )
            .join(
              "",
            )}</ul><p id="folder-no-results" role="status" hidden>${esc(t("noResults"))}</p>`
        : `<p>${esc(t("folderEmpty"))}</p>`
    }
  </section>`;
}
async function pickTemplateFolder() {
  const folder = await platform.pickTemplateFolder();
  if (!folder) return;
  templateFolder = folder;
  if (view === "recent") render();
  else await navigate("recent");
  focus(folder.files.length ? "folder-search" : "open-folder");
}
function bindRecent() {
  click("open-folder", pickTemplateFolder);
  click("refresh-folder", async () => {
    templateFolder = await platform.refreshTemplateFolder();
    render();
    focus("refresh-folder");
  });
  click("close-folder", () => {
    templateFolder = null;
    render();
    focus("open-folder");
  });
  const files = root.querySelectorAll<HTMLButtonElement>(
    "[data-folder-template]",
  );
  files.forEach((item) => {
    item.onclick = () =>
      void run(async () =>
        openDocument(
          await platform.openFolderTemplate(
            Number(item.dataset.folderTemplate),
          ),
        ),
      );
  });
  on("folder-search", "input", (event) => {
    const query = (event.target as HTMLInputElement).value
      .trim()
      .toLocaleLowerCase();
    let matched = false;
    files.forEach((item) => {
      const visible = item.textContent!.toLocaleLowerCase().includes(query);
      item.closest("li")!.hidden = !visible;
      matched ||= visible;
    });
    document.getElementById("folder-no-results")!.hidden = matched;
  });
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
    if (!(await confirmAction("clearRecentConfirm", "", t("clearRecent"))))
      return;
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
    recordedOutputs = new WeakMap();
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
function libraryFormButtons() {
  return (
    button("start-form", "startAdHocForm", "primary") +
    (layoutOverride === null
      ? ""
      : button(
          "start",
          layoutOverride === "classic" ? "start" : "scannerWorkflow",
        ))
  );
}
function selectedTemplateView(): string {
  if (!focusedWorkflow)
    return `<div id="template-preview">${outputPreview(draft!)}</div>${editorView()}`;
  return `<h2>${esc(draft!.name)}</h2>
    <div id="template-preview">${outputPreview(draft!)}</div>
    <div class="actions">${libraryFormButtons()}</div>
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
      <div class="actions">${button("save", "save")}${button("source-csv", "sourceCSV")}${focusedWorkflow ? "" : libraryFormButtons()}</div>`;
  }
  return `<div class="section-head"><p class="eyebrow">${esc(t("library"))}</p><div class="toolbar">${button("export-template", "exportTemplate")}${button("duplicate", "duplicate")}${button("delete", "delete", "danger")}</div></div>
  <div class="metadata"> <div>${field("template-name", "name", d.name, 'maxlength="250"')}</div><div>${field("template-folder", "folder", d.folder, 'maxlength="250"')}</div></div>
  <label for="placeholder-style">${esc(t("placeholderStyle"))}</label><select id="placeholder-style"><option value="braces" ${d.placeholderStyle === "braces" ? "selected" : ""}>${esc(t("bracesStyle"))}</option><option value="angle" ${d.placeholderStyle !== "braces" ? "selected" : ""}>${esc(t("angleStyle"))}</option></select><p class="hint">${esc(t("escapeHelp"))}</p>
  ${check("email-enabled", "emailMode", d.email?.enabled ?? false)}
  ${d.email?.enabled ? `<section class="email-template"><p class="hint">${esc(t("emailTemplateHelp"))}</p>${check("email-subject-enabled", "enableSubject", d.email.subjectEnabled !== false)}${d.email.subjectEnabled !== false ? field("email-subject", "subject", d.email.subject) : ""}${field("email-to", "to", d.email.to)}${check("email-cc-enabled", "enableCc", d.email.ccEnabled)}${d.email.ccEnabled ? field("email-cc", "cc", d.email.cc) : ""}${check("email-bcc-enabled", "enableBcc", d.email.bccEnabled)}${d.email.bccEnabled ? field("email-bcc", "bcc", d.email.bcc) : ""}<h2>${esc(t("emailOrder"))}</h2><p class="hint">${esc(t("emailOrderHelp"))}</p><p class="hint">${esc(t("reorderHelp"))}</p><ol id="email-order" class="field-order">${emailOrderView(d)}</ol></section>` : ""}
  <label for="template-content">${esc(t(d.email?.enabled ? "body" : "content"))}</label><textarea id="template-content" class="code template-text" spellcheck="false" aria-describedby="placeholder-help">${esc(d.content)}</textarea><p id="placeholder-help" class="hint">${esc(t(d.placeholderStyle === "braces" ? "bracePlaceholderHelp" : "placeholderHelp"))}</p>
  <label for="extra-scanner-fields">${esc(t("extraScannerFields"))}</label><textarea id="extra-scanner-fields" rows="3" spellcheck="false" aria-describedby="extra-fields-help extra-fields-error">${esc(extraFieldInput ?? (d.extraFields ?? []).join("\n"))}</textarea><p id="extra-fields-help" class="hint">${esc(t("extraFieldsHelp"))}</p><p id="extra-fields-error" role="alert" ${extraFieldsInvalid ? "" : "hidden"}>${extraFieldsInvalid ? esc(t("invalidExtraFields")) : ""}</p>
  <div class="editor-bottom"><section><h2>${esc(t("fields"))}</h2><p class="hint">${esc(t("reorderHelp"))}</p><ol id="field-order" class="field-order">${orderView()}</ol></section><details><summary>${esc(t("templateSettings"))}</summary>${check("template-verify", "verificationEnabled", d.verificationEnabled)}${check("typing-verify", "typingVerification", d.typingVerification ?? false)}${comparisonView(d.comparison, "template")}</details></div>
  <div class="actions">${button("save", "save")}${focusedWorkflow ? "" : libraryFormButtons()}</div><p class="hint">${esc(t("keyboardHelp"))}</p>`;
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
function csvRowPicker(data: CSVRecords): Input {
  return {
    key: "row",
    label: t("csvRow"),
    options: data.rows.map((row, i) => ({
      value: String(i),
      label: `${i + 1} · ${row
        .slice(0, 3)
        .map((value) => value.slice(0, 40))
        .join(" · ")}`,
    })),
    searchOptions: {
      label: t("searchCSVRows"),
      previous: t("previous"),
      next: t("next"),
      match: (id, query) =>
        String(Number(id) + 1) === query ||
        data.rows[Number(id)].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
      details: (id) =>
        data.headers.map((key, column) => [key, data.rows[Number(id)][column]]),
    },
  };
}
function csvSeed(template: Template, row: ReadonlyMap<string, string>) {
  const seed = startSession(template);
  seed.fields = Array.from(row, ([name, value]) => ({
    name,
    value,
    status: "captured",
  }));
  return seed;
}
type CSVSession = {
  data: CSVRecords;
  row: number;
  error?: string;
};
type AppendSession = {
  destination?: CSVAppendDestination;
  data?: CSVRecords;
  receipt?: { name: string; row: number };
  written?: string;
};
const templateDocuments = new WeakMap<Session, OpenDocument>();
const appendStates = new WeakMap<Session, AppendSession>();
const appending = new WeakSet<Session>();
const csvCache = new WeakMap<Session, CSVSession>();
const csvDrafts = new WeakMap<
  Session,
  Pick<Session, "fields" | "active" | "sourceContext">
>();
const csvSessions = new WeakMap<Session, CSVSession>();
const csvPageSize = 500;

function prepareCSVRow(s: Session, csv: CSVSession) {
  const parsed = parseSource(s.template.content);
  s.sourceContext = {
    ...s.sourceContext,
    csv: {
      row: csv.row + 1,
      rows: csv.data.rows.length,
      file: parsed.csv?.file,
    },
  };
  const values = csvRecord(csv.data, csv.row);
  const fields = startSession(s.template).fields.map((field) =>
    values.has(field.name)
      ? {
          ...field,
          value: normalizeText(
            s.controls?.get(field.name),
            values.get(field.name)!,
          ),
          status: "captured" as const,
          checkedByTyping: undefined,
        }
      : {
          ...field,
          status:
            field.value === null ? ("empty" as const) : ("captured" as const),
          checkedByTyping: undefined,
        },
  );
  s.fields = fields;
  csv.error = undefined;
  try {
    s.prepared = prepareSections({
      ...s,
      readOnlySource: true,
      template: {
        ...s.template,
        verificationEnabled: false,
        typingVerification: false,
      },
    });
  } catch (error) {
    s.prepared = [];
    csv.error = errorText(error);
  }
  s.deliveryIndex = 0;
  s.deliveryDone = false;
}

async function loadCSVMode(template: Template, file?: OpenDocument) {
  const csv = parseSource(template.content).csv;
  let content = csv
    ? await platform.readLinkedCSV(file?.recentToken, csv.file)
    : null;
  if (content === null) {
    if (
      csv &&
      !(await confirmAction("csvPickLinked", csv.file, t("openDocument")))
    )
      return null;
    content = await platform.importTemplates("csv");
  }
  return content === null ? null : { data: csvRecords(content), row: 0 };
}

async function openLinkedCSV(template: Template, file?: OpenDocument) {
  const data = await loadCSVMode(template, file);
  if (!data) return false;
  const opened = await launch(
    template,
    undefined,
    false,
    false,
    undefined,
    undefined,
    data,
  );
  if (opened && session && file) templateDocuments.set(session, file);
  return opened;
}

async function openDocumentTemplate(
  template: Template,
  row?: ReadonlyMap<string, string>,
  file?: OpenDocument,
) {
  const source = parseSource(template.content);
  const workflow = source.workflow;
  if (!(await abandonDraft())) return;
  if (workflow === "csv") {
    await openLinkedCSV(template, file);
    return;
  }
  const opened = await launch(
    template,
    undefined,
    false,
    true,
    undefined,
    row ? csvSeed(template, row) : undefined,
  );
  if (opened && session) {
    if (file) templateDocuments.set(session, file);
    const outputId = file?.outputId ?? undefined;
    const savedStep =
      file?.stepIndex ??
      source.steps?.findIndex(
        (step) => outputId !== undefined && step.outputs.includes(outputId),
      );
    if (source.steps && savedStep !== undefined && source.steps[savedStep]) {
      activateFormStep(session, savedStep, outputId);
      resetOutputOptions(session);
      render();
      focusStepField(session);
    } else if (
      !source.steps &&
      outputId &&
      source.outputs.some((output) => output.id === outputId)
    ) {
      session.outputId = outputId;
      resetOutputOptions(session);
      render();
    }
    if (workflow === "append") await switchSourceMode("append");
  }
}
async function openDocument(file: OpenDocument) {
  if (file.content === null) throw Error("invalidImport");
  if (file.format === "source") {
    await openDocumentTemplate(documentTemplate(file), undefined, file);
    return;
  }
  const data = csvRecords(file.content);
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
  const row = csvRecord(data, Number(choice.row));
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
      data.headers[0],
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
// OS open events can arrive during a dialog. Leave the queue pending until the UI is idle.
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
    const data = csvRecords(csv);
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
      csvSeed(draft!, csvRecord(data, Number(result.row))),
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
          !isSnippetCollection(session!) &&
          !appending.has(session!) &&
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
    next === "session" && templateFormActive(),
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
  return `<main class="settings"><header class="section-head"><h1>${esc(t("settings"))}</h1>${button("update-app", "updateApp")}</header><p class="hint">${esc(t("updateHelp"))}</p><details class="legacy-library"><summary>${esc(t("legacyLibrary"))}</summary><p>${esc(t("legacyLibraryHelp"))}</p>${button("open-legacy-library", "templates")}</details><div class="settings-grid"><section><h2>${esc(t("general"))}</h2><label for="language">${esc(t("language"))}</label><select id="language"><option value="en" ${p.language === "en" ? "selected" : ""}>English</option><option value="zh-CN" ${p.language === "zh-CN" ? "selected" : ""}>简体中文</option></select><label for="theme">${esc(t("theme"))}</label><select id="theme">${(["SYSTEM", "LIGHT", "DARK"] as const).map((theme) => `<option value="${theme}" ${theme === p.theme ? "selected" : ""}>${esc(t(theme))}</option>`).join("")}</select>${check("launchAtLogin", "launchAtLogin", p.launchAtLogin)}${check("minimizeToTray", "minimizeToTray", p.minimizeToTray)}${check("alwaysOnTop", "alwaysOnTop", p.alwaysOnTop)}${check("autoAdvance", "autoAdvance", p.autoAdvance)}${check("focusedWorkflow", "focusedView", p.focusedWorkflow ?? false)}${check("hideLivePreview", "hideLivePreview", p.hideLivePreview ?? false)}${check("tabBetweenSections", "sectionTab", p.tabBetweenSections ?? false)}<label for="outputHistoryLimit">${esc(t("outputHistoryLimit"))}</label><input id="outputHistoryLimit" type="number" min="0" max="${maxOutputHistoryLimit}" step="1" value="${historyLimit(p)}" aria-describedby="output-history-help"><p id="output-history-help" class="hint">${esc(t("outputHistoryHelp"))}</p></section>
  <section><h2>${esc(t("verification"))}</h2>${check("verificationDefault", "verificationDefault", p.verificationDefault)}${check("verifiedBackground", "verifiedBackground", p.verifiedBackground)}${comparisonView(p.comparison, "default")}</section>
  <section><h2>${esc(t("privacy"))}</h2>${check("clearAfterCompletion", "clearAfterCompletion", p.clearAfterCompletion)}${check("restoreClipboard", "restoreClipboard", p.restoreClipboard)}<p class="hint">${esc(t("clipboardDefaultHelp"))}</p><p class="hint">${esc(t("quitPrivacy"))}</p></section>
  <section><h2>${esc(t("shortcuts"))}</h2><p class="hint">${esc(t("keyboardHelp"))}</p><p class="hint">${esc(t("shortcutHelp"))}</p>${check("globalShortcuts", "globalShortcuts", p.globalShortcuts)}${button("alternate-shortcuts", "alternateShortcuts")}${actions.map((action) => field("key-" + action, action === "cancel" ? "cancelSession" : action, keyLabel(p.shortcuts[action]), 'class="shortcut-input"')).join("")}</section></div><div class="actions">${button("save-settings", "saveSettings", "primary", locked)}</div><section class="about" aria-labelledby="about-heading"><h2 id="about-heading">${esc(t("about"))}</h2><p>${esc(t("copyright"))}</p><a id="repository-link" href="https://github.com/iandorsey00/veraflow" target="_blank" rel="noopener noreferrer">${esc(t("repository"))}</a></section></main>`;
}
function refreshTrayMenu() {
  return platform.trayMenu(library.preferences.language, !!availableUpdate);
}
async function checkAvailableUpdate() {
  if (updateCheck) return updateCheck;
  updateCheck = (async () => {
    const hadUpdate = !!availableUpdate;
    availableUpdate = await platform.checkUpdate();
    if (view === "recent" && !busy && hadUpdate !== !!availableUpdate) render();
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
    "tabBetweenSections",
  ] as const)
    on(key, "change", (e) => {
      p[key] = (e.target as HTMLInputElement).checked;
      if (
        (key === "focusedWorkflow" ||
          key === "hideLivePreview" ||
          key === "tabBetweenSections") &&
        !p[key]
      )
        delete p[key];
      dirty = true;
    });
  bindComparison("default", p.comparison);
  for (const action of actions)
    on("key-" + action, "input", (e) => {
      p.shortcuts[action] = shortcutAccelerator(
        (e.target as HTMLInputElement).value,
      );
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
      if (!limit) recordedOutputs = new WeakMap();
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
    !appending.has(session) &&
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
  linkedCSV?: CSVSession,
): Promise<boolean> {
  const snippets =
    template.placeholderStyle === "source" &&
    parseSource(template.content).snippets;
  const unified =
    !snippets &&
    (template.placeholderStyle === "source" || layoutOverride === null);
  if (snippets) form = false;
  else if (unified && !linkedCSV) form = true;
  const slot = snippets
    ? "snippet"
    : template.id === "scanner"
      ? "freeScanner"
      : "template";
  const replacingCurrent = !!session && sessionSlot(session) === slot;
  const replaced = replacingCurrent
    ? session
    : parkedSessions.get(slot)?.session;
  const replacedRetained = replacingCurrent
    ? retainedScanner
    : parkedSessions.get(slot)?.retained;
  if (
    !linkedCSV &&
    template.placeholderStyle === "source" &&
    !seed &&
    !form &&
    parseSource(template.content).workflow === "csv"
  )
    return openLinkedCSV(template);
  if (
    ((replaced && replaced.mode !== "complete") || replacedRetained) &&
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
  nextSession.unifiedForm = unified;
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
      verify: field.verify,
    }));
  }
  if (linkedCSV) {
    csvSessions.set(nextSession, linkedCSV);
    csvCache.set(nextSession, linkedCSV);
    nextSession.mode = "delivery";
    prepareCSVRow(nextSession, linkedCSV);
  } else if (form || reuse || template.placeholderStyle === "source") {
    prepareWorkflow(nextSession, form);
  }
  const shortcutError = await configureSessionShortcuts(!form && !snippets);
  await platform.mouseSource(false);
  await platform.active(true);
  await platform.compact(!form, library.preferences.alwaysOnTop, form);
  if (replaced && appendStates.has(replaced)) await platform.releaseAppendCSV();
  if (session && !replacingCurrent && !scannerSource) parkCurrentSession();
  else if (session && session !== replaced) eraseSession(session);
  parkedSessions.delete(slot);
  if (replaced) eraseSession(replaced);
  if (replacedRetained && replacedRetained !== retainedScanner)
    eraseSession(replacedRetained);
  session = nextSession;
  templateForm = form;
  groupSections = false;
  pasteOptionsOpen = false;
  sectionOrderOpen = false;
  pasteOrder = null;
  sectionTab = library.preferences.tabBetweenSections === true;
  deliveryMode =
    template.placeholderStyle === "source"
      ? selectedSourceOutput(session).delivery.mode
      : "step";
  typingCheck = false;
  if (linkedCSV || snippets) lastTemplate = null;
  else if (template.id !== "scanner")
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
  if (snippets) focus("snippet-run-0");
  else if (linkedCSV) focus("csv-row");
  else if (sessionSteps(session)) focusStepField(session);
  else if (!session.fields.length) focus("finish");
  if (shortcutError) report(shortcutError);
  return true;
}
async function rememberOutput(s: Session, text: string) {
  const limit = historyLimit();
  if (!limit) return;
  const output =
    s.template.placeholderStyle === "source" &&
    parseSource(s.template.content).outputs.length > 1
      ? selectedSourceOutput(s)
      : undefined;
  const signature = output ? `${output.id}\0${text}` : text;
  if (recordedOutputs.get(s) === signature) return;
  try {
    const title = output
      ? `${s.template.name} · ${output.label}`
      : s.template.name;
    await platform.recordOutput(title, text, limit);
    recordedOutputs.set(s, signature);
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
  return s.template.name;
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
    ${!ready && (!s.scanner || progress.checking || f?.value === null) ? `<p class="hint"><kbd>${esc(keyLabel(p.shortcuts[progress.checking ? "verify" : "capture"]))}</kbd> ${esc(t(progress.checking ? "compareSelection" : "captureSelected"))}</p>` : ""}
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
    ${s.scanner ? `<p class="vera-id">${esc(s.scannerId)}</p><p class="hint">${esc(t("scannerTemporary"))}</p>` : ""}
    </details>
    <details id="session-options" ${sessionOptionsOpen ? "open" : ""}><summary>${esc(t("sessionOptions"))}</summary>${check("mouse-mode", "mouseMode", mouseMode)}${check("preserve-clipboard", "preserveClipboard", preserveClipboard)}<p class="hint">${esc(t("preserveClipboardHelp"))}</p><p class="hint">${esc(t("mouseHelp"))}</p><dl class="shortcut-list">${actions.map((a) => `<dt>${esc(t(a === "cancel" ? "cancelSession" : a))}</dt><dd><kbd>${esc(keyLabel(p.shortcuts[a]))}</kbd></dd>`).join("")}</dl></details>
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

function picker(
  id: string,
  label: Key,
  options: string,
  previous: Key,
  next: Key,
  arrows: boolean,
) {
  return `<div class="session-picker"><label for="${id}">${esc(t(label))}</label><div class="picker-controls">
    <select id="${id}">${options}</select>
    ${arrows ? `<button id="${id}-previous" aria-label="${esc(t(previous))}">←</button><button id="${id}-next" aria-label="${esc(t(next))}">→</button>` : ""}
  </div></div>`;
}

function availableOutputs(s: Session) {
  const source = parseSource(s.template.content);
  const step = currentFormStep(s);
  return step
    ? step.outputs.map((id) => sourceOutput(source, id))
    : source.outputs;
}

function outputSelector(s: Session) {
  if (s.template.placeholderStyle !== "source") return "";
  const outputs = availableOutputs(s);
  if (outputs.length < 2 && !csvSessions.has(s)) return "";
  const selected = s.outputId ?? outputs[0].id;
  const options = outputs
    .map(
      (output) =>
        `<option value="${esc(output.id)}" ${output.id === selected ? "selected" : ""}>${esc(output.label)}</option>`,
    )
    .join("");
  return picker(
    "source-output",
    "outputHeading",
    options,
    "previousOutput",
    "nextNamedOutput",
    outputs.length > 1,
  );
}

function csvSelector(s: Session, csv: CSVSession) {
  const source = parseSource(s.template.content);
  const start = Math.floor(csv.row / csvPageSize) * csvPageSize;
  const end = Math.min(start + csvPageSize, csv.data.rows.length);
  const options = [];
  if (start)
    options.push(
      `<option value="${start - 1}">${esc(t("previousCSVRows"))}</option>`,
    );
  for (let index = start; index < end; index++) {
    const values = csv.data.rows[index];
    const label = (
      source.csvLabel?.(csvRecord(csv.data, index), {
        ...s.sourceContext,
        outputName: selectedSourceOutput(s).label,
        csv: {
          row: index + 1,
          rows: csv.data.rows.length,
          file: source.csv?.file,
        },
      }) ??
      values
        .slice(0, 3)
        .map((value) => value.slice(0, 80).trim())
        .filter(Boolean)
        .join(" · ")
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    options.push(
      `<option value="${index}" ${index === csv.row ? "selected" : ""}>${index + 1}${label ? " · " + esc(label) : ""}</option>`,
    );
  }
  if (end < csv.data.rows.length)
    options.push(`<option value="${end}">${esc(t("nextCSVRows"))}</option>`);
  return picker(
    "csv-row",
    "csvRow",
    options.join(""),
    "previousCSVRow",
    "nextCSVRow",
    csv.data.rows.length > 1 || source.outputs.length > 1,
  );
}

function outputInstructions(template: Template, outputId?: string) {
  if (template.placeholderStyle !== "source") return "";
  const source = parseSource(template.content);
  const text = sourceOutput(
    source,
    outputId ?? source.steps?.[0].outputs[0],
  ).instructions;
  return text
    ? `<p class="field-instructions output-instructions">${esc(text)}</p>`
    : "";
}

function outputPreview(template: Template, s?: Session): string {
  try {
    return `<section class="template-output" aria-label="${esc(t("outputPreview"))}">
      <h2>${esc(t("outputPreview"))}</h2>
      ${outputInstructions(template, s?.outputId)}
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
  const inForm = id.startsWith("form-field-");
  const description = inForm
    ? `aria-describedby="${definition?.instructions ? `form-instructions-${index} ` : ""}form-state-${index}"`
    : "";
  const attrs = `id="${id}" data-control="${index}" ${description} autocomplete="off"`;
  if (definition?.options) {
    const options = [...definition.options].map(([key, text]) => [
      key,
      definition.kind === "boolean"
        ? t(key === "true" ? "booleanYes" : "booleanNo")
        : text,
    ]);
    const conditionalChoice =
      options.length <= 5 &&
      (sourceConditionDrivers(s).includes(field.name) ||
        (s.template.placeholderStyle === "source" && id === "scanner-control"));
    if (
      definition.kind === "radio" ||
      conditionalChoice ||
      (s.unifiedForm && definition.kind === "boolean")
    ) {
      if (conditionalChoice && definition.optional && !comparing && inForm)
        options.push(["", t("leaveUnanswered")]);
      return `<fieldset id="${id}"><legend>${esc(name)}</legend>
        ${options.map(([key, text], i) => `<label class="check"><input type="radio" id="${id}-${i}" name="${id}" data-control="${index}" ${description} value="${esc(key)}" ${key === value ? "checked" : ""}>${esc(definition.optionLabels?.get(key) ?? (text || key))}</label>`).join("")}
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
function templateInstructions(s: Session) {
  if (s.template.placeholderStyle !== "source") return "";
  const text = parseSource(s.template.content).instructions;
  return text
    ? `<aside class="template-instructions" aria-label="${esc(t("templateInstructions"))}">${esc(text)}</aside>`
    : "";
}

function formAttentionView(s: Session, row = false, headers?: string[]) {
  const attention = formAttention(s, row, headers);
  if (!attention.length) return "";
  return `<section class="form-attention" aria-label="${esc(t("formAttention"))}">
    <div class="section-head"><h2>${esc(t("formAttention"))}</h2>
      ${button("form-next-attention", "formNextAttention", "quiet")}
    </div>
    <ul>${attention
      .map(
        ({ index, check }) =>
          `<li><button class="quiet" data-form-attention="${index}">${esc(fieldLabel(s, s.fields[index].name))} · ${esc(t(check ? "fieldNeedsVerification" : "fieldNeedsValue"))}</button></li>`,
      )
      .join("")}</ul>
  </section>`;
}

function formFieldActions(s: Session, index: number) {
  const field = s.fields[index];
  const name = fieldLabel(s, field.name);
  const required = fieldRequiresVerification(s, field);
  const options = s.controls?.get(field.name)?.options;
  const action = (id: string, key: Key, disabled = false) =>
    `<button class="quiet" data-form-field-action="${id}" data-index="${index}" aria-label="${esc(t(key) + " · " + name)}" ${disabled ? "disabled" : ""}>${esc(t(key))}</button>`;
  return `<div class="form-field-actions">
    ${options ? "" : action("capture", "fieldCaptureSelection", !desktop)}
    ${action("verify", field.status === "verified" ? "fieldVerifyAgain" : "fieldVerify", !field.value?.trim())}
    ${action("copy", "copyField", !field.value?.trim() || (required && field.status !== "verified"))}
    ${s.scanner ? action("settings", "formFieldSettings") : ""}
  </div>${field.status === "mismatch" && field.value !== null && field.candidate !== undefined ? mismatchView(field.value, field.candidate) : ""}`;
}

function focusFormField(index: number) {
  session!.active = index;
  const row = document.querySelector<HTMLElement>(`[data-form-row="${index}"]`);
  const optional = row?.closest("details");
  if (optional) optional.open = true;
  focus(controlFocus(`form-field-${index}`));
}

async function verifyFormField(s: Session, index: number) {
  const field = s.fields[index];
  if (!field.value?.trim()) throw Error("noValue");
  const control = s.controls?.get(field.name);
  let value: string | undefined;
  if (desktop && !control?.options) {
    const method = await actionDialog(
      "fieldVerify",
      `<p>${esc(t("reenterValue"))}</p><pre>${esc(field.value)}</pre>`,
      `<button value="cancel">${esc(t("cancel"))}</button><button value="manual" autofocus>${esc(t("fieldEnterOriginal"))}</button><button value="capture" class="primary">${esc(t("compareSelection"))}</button>`,
    );
    if (method === "capture")
      value = await platform.mouseTransfer(preserveClipboard);
    else if (method !== "manual") return;
  }
  if (value === undefined) {
    const fields: Input[] = [
      {
        key: "original",
        label: fieldLabel(s, field.name),
        lines: fieldUsesTextarea(s, field.name, field.value),
        options: control?.options
          ? [
              { value: "", label: t("chooseValue") },
              ...[...control.options].map(([value, label]) => ({
                value,
                label: control.optionLabels?.get(value) ?? label,
              })),
            ]
          : undefined,
      },
    ];
    const result = await formDialog(
      t("fieldVerify"),
      fields,
      t("compare"),
      t("cancel"),
      (values) => (values.original.trim() ? null : t("emptySelection")),
    );
    if (!result) return;
    value = result.original;
  }
  const mode = s.mode;
  s.active = index;
  s.mode = "verify";
  try {
    verify(s, value, false);
  } finally {
    s.mode = mode;
  }
  render();
  focusFormField(index);
}

async function editAdHocField(s: Session, index: number) {
  const field = s.fields[index];
  const current = field.verify === undefined ? "" : String(field.verify);
  const result = await formDialog(
    t("formFieldSettings"),
    [
      { key: "name", label: t("scannerFieldName"), value: field.name },
      {
        key: "verify",
        label: t("verification"),
        value: current,
        options: [
          { value: "", label: t("formUseDefault") },
          { value: "true", label: t("formRequireVerification") },
          { value: "false", label: t("formVerificationOptional") },
        ],
      },
    ],
    t("saveFieldName"),
    t("cancel"),
    (values) => {
      try {
        renameScannerField(structuredClone(s), index, values.name);
        return null;
      } catch {
        return t("scannerFieldInvalid");
      }
    },
  );
  if (!result) return;
  renameScannerField(s, index, result.name);
  field.verify = result.verify === "" ? undefined : result.verify === "true";
  render();
  focusFormField(index);
}

function formFieldState(s: Session, index: number): Key {
  const field = s.fields[index];
  if (field.status === "verified") return "formVerified";
  if (
    field.status !== "mismatch" &&
    field.value &&
    fieldRequiresVerification(s, field)
  )
    return "fieldNeedsVerification";
  return field.status;
}

function unifiedFormFields(
  s: Session,
  fields: { field: Session["fields"][number]; index: number }[],
  active?: Set<string>,
) {
  const unfilledOptional = ({ field }: (typeof fields)[number]) =>
    !!s.controls?.get(field.name)?.optional && !field.value?.trim();
  const rows = (entries: typeof fields) =>
    entries
      .map(({ field, index }) => {
        const instructions = s.controls?.get(field.name)?.instructions;
        return `<div class="template-form-field ${library.preferences.verifiedBackground && field.status === "verified" ? "verified-background" : ""}" data-form-row="${index}" ${active && !active.has(field.name) ? "hidden" : ""}>
      ${fieldControl(s, index, `form-field-${index}`)}
      ${instructions ? `<p class="field-instructions" id="form-instructions-${index}">${esc(instructions)}</p>` : ""}
      <small id="form-state-${index}">${esc(t(formFieldState(s, index)))}</small>
      <div data-form-field-tools="${index}">${formFieldActions(s, index)}</div>
    </div>`;
      })
      .join("");
  const optional = fields.filter(unfilledOptional);
  return (
    rows(fields.filter((entry) => !unfilledOptional(entry))) +
    (optional.length
      ? `<details class="form-optional" ${optional.some(({ index }) => index === s.active && s.fields[index].value !== null) ? "open" : ""}><summary>${esc(t("formOptionalDetails"))}</summary>${rows(optional)}</details>`
      : "")
  );
}

function stepHeading(
  s: Session,
  steps: NonNullable<ReturnType<typeof sessionSteps>>,
) {
  const index = s.stepIndex ?? 0;
  return `<div class="form-step-heading">
    <p class="eyebrow">${esc(t("formStep"))} ${index + 1}/${steps.length}</p>
    <h2 id="form-step-heading" tabindex="-1">${esc(steps[index].title)}</h2>
  </div>`;
}

function stepWarnings(s: Session) {
  if (!s.stepOutputs?.size) return "";
  const source = parseSource(s.template.content);
  const items = (source.steps ?? []).flatMap((step) =>
    step.outputs.flatMap((id) => {
      const progress = s.stepOutputs?.get(id);
      if (!progress?.needsReview && !progress?.staleSections.size) return [];
      const label =
        step.outputs.length === 1
          ? step.title
          : `${step.title} · ${sourceOutput(source, id).label}`;
      return [
        `<li><strong>${esc(label)}</strong> · ${esc(t(progress.staleSections.size ? "formStepCopiedStale" : "formStepOutputStale"))}</li>`,
      ];
    }),
  );
  return items.length ? `<ul class="step-warnings">${items.join("")}</ul>` : "";
}

function reusedStepFields(s: Session, own: Set<string>, active?: Set<string>) {
  const values = s.fields.filter(
    (field) => !own.has(field.name) && active?.has(field.name),
  );
  if (!values.length) return "";
  return `<details class="step-reused">
    <summary>${esc(t("formStepReused"))}</summary>
    <dl>${values.map((field) => `<dt>${esc(fieldLabel(s, field.name))}</dt><dd>${esc(field.value ?? t("empty"))} <small>${esc(t(field.status === "verified" ? "formVerified" : field.status))}</small></dd>`).join("")}</dl>
  </details>`;
}

function focusStepField(s: Session) {
  const field = document.getElementById(`form-field-${s.active}`);
  if (
    field?.closest("[data-form-row]:not([hidden])") &&
    !field.closest("details:not([open])")
  )
    focus(controlFocus(field.id));
  else focus("form-step-heading");
}

async function openFormStep(s: Session, index: number) {
  activateFormStep(s, index);
  delete s.prepared;
  resetOutputOptions(s);
  lastStep = null;
  await switchTemplateView(true);
}

function moveFormStep(offset: number) {
  const s = session!;
  const steps = sessionSteps(s);
  if (!steps) return;
  const current = s.stepIndex ?? 0;
  const next = current + offset;
  if (
    steps[next] &&
    (offset < 0 ||
      (s.mode === "delivery" && s.prepared) ||
      !steps[current].outputs.length)
  )
    return openFormStep(s, next);
}

function templateFormView(s: Session): string {
  const active = activeSourceFields(s);
  const steps = sessionSteps(s);
  const stepIndex = s.stepIndex ?? 0;
  const step = steps?.[stepIndex];
  const own = step && new Set(step.fields);
  const fields = s.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) =>
      own ? own.has(field.name) : active || fieldVisible(s, field.name),
    );
  // Put choices first and prioritize condition drivers within each group.
  const dependencies = new Set([
    ...sourceConditionDrivers(s),
    ...[...(s.controls?.values() ?? [])].flatMap((control) =>
      control.when ? [control.when.name] : [],
    ),
  ]);
  const rank = (name: string) =>
    (s.controls?.get(name)?.options ? 0 : 2) + (dependencies.has(name) ? 0 : 1);
  fields.sort((a, b) => rank(a.field.name) - rank(b.field.name));
  if (s.unifiedForm)
    return `<main class="capture-panel template-form unified-form">
    <header><h1>${esc(s.template.name)}</h1>${templateInstructions(s)}${steps ? stepHeading(s, steps) : ""}${outputSelector(s)}
      <div class="task-toolbar">
        ${s.template.placeholderStyle === "source" ? (steps ? "" : sourceModeButtons("form")) + button("extract-source", "extractSource", "quiet") + button("batch-compare", "batchCompare", "quiet") + button("save-record", "saveRecord", "quiet") + button("import-record", "importRecord", "quiet") : ""}
        ${s.scanner ? button("scanner-add", "addField", "quiet") + button("extract-source", "extractSource", "quiet") + button("custom-form-use-file", "customFormUseFile", "quiet") : ""}
        ${button("pause-task", "pauseTask", "quiet")}
      </div>
      ${focusedWorkflow ? `<p class="task-progress">${esc(progressText(s))}</p>` : ""}
    </header>
    <div class="template-form-grid ${library.preferences.hideLivePreview ? "without-preview" : ""}"><div>
      ${step && own ? reusedStepFields(s, own, step.references) : ""}
      ${unifiedFormFields(s, fields, active)}
      ${steps ? `<div id="step-warnings" aria-live="polite">${stepWarnings(s)}</div>` : ""}
      <div id="form-attention" aria-live="polite">${formAttentionView(s)}</div>
      <div class="actions">${steps && stepIndex > 0 ? button("step-previous", "formStepPrevious", "quiet") : ""}${s.scanner ? "" : button("finish", step && !step.outputs.length ? (steps![stepIndex + 1] ? "formStepNext" : "closeSession") : s.template.placeholderStyle === "source" ? "prepareSections" : s.template.email?.enabled ? "emailPrepare" : "finish", "primary")}${step && step.outputs.length > 1 ? button("prepare-step-outputs", "prepareStepOutputs") : ""}</div>
      ${s.scanner ? `<details class="form-tools"><summary>${esc(t("formTools"))}</summary>${scannerControls(true)}</details>` : ""}
    </div><div id="form-output" ${library.preferences.hideLivePreview || step?.outputs.length === 0 ? "hidden" : ""}>${library.preferences.hideLivePreview || step?.outputs.length === 0 ? "" : s.scanner ? freeScannerPreview(s) : outputPreview(s.template, s)}</div></div>
    <div class="actions">${button("cancel-session", "closeSession", "quiet")}</div>
  </main>`;
  const f = s.fields[s.active];
  return `<main class="capture-panel template-form ${focusedWorkflow ? "focused-session" : ""}">
    <h1>${esc(s.template.name)}</h1>
    ${templateInstructions(s)}
    ${typingCheck && s.verificationOutputOnly ? "" : outputSelector(s)}
    <div class="task-toolbar">${!typingCheck && s.template.placeholderStyle === "source" ? button("batch-compare", "batchCompare", "quiet") + button("save-record", "saveRecord", "quiet") + button("reverify-form", "verifyAgain", "quiet", !s.fields.some((field) => field.value?.trim() && fieldVisible(s, field.name, active))) : ""}${s.template.placeholderStyle === "source" ? sourceModeButtons("form") : button("switch-scanner", "openInScanner")}${button("pause-task", "pauseTask")}</div>
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

async function switchSourceMode(mode: SourceWorkflow, useRow = false) {
  const s = session!;
  const csv = csvSessions.get(s);
  if (mode === "csv") {
    const data =
      csvCache.get(s) ??
      (await loadCSVMode(s.template, templateDocuments.get(s)));
    if (!data) return;
    csvDrafts.set(s, {
      fields: s.fields,
      active: s.active,
      sourceContext: s.sourceContext,
    });
    csvCache.set(s, data);
    csvSessions.set(s, data);
    appending.delete(s);
    s.mode = "delivery";
    await configureSessionShortcuts(true);
    await platform.compact(true, library.preferences.alwaysOnTop, false);
    renderCSVSelection(s, data, "csv-row");
    return;
  }
  if (csv) {
    const draft = csvDrafts.get(s);
    if (
      useRow &&
      draft &&
      !(await confirmAction("replaceDraftWithRow", "", t("useCSVRow")))
    )
      return;
    if (!useRow && draft) Object.assign(s, draft);
    else {
      taskGeneration++;
      manualDrafts.clear();
      for (const field of s.fields) {
        delete field.checkedByTyping;
        if (field.value !== null) field.status = "captured";
      }
    }
    csvDrafts.delete(s);
    csvSessions.delete(s);
  }
  delete s.prepared;
  if (mode === "append") {
    if (s.mode === "delivery") prepareWorkflow(s, s.typing === true);
    appending.add(s);
    await configureSessionShortcuts(false);
    await platform.mouseSource(false);
    await platform.compact(false, library.preferences.alwaysOnTop, true);
    if (!appendStates.has(s)) {
      appendStates.set(s, {});
      const file = parseSource(s.template.content).append?.file;
      const token = templateDocuments.get(s)?.recentToken;
      if (file && token != null && desktop) {
        try {
          await chooseAppendDestination(s, true);
        } catch (error) {
          render();
          throw error;
        }
        return;
      }
    }
    message = "";
    render();
    focus("append-choose");
    return;
  }
  appending.delete(s);
  await switchTemplateView(mode === "form");
}

function sourceModeButtons(current: SourceWorkflow) {
  return [
    current === "form" ? "" : button("switch-form", "fillForm", "quiet"),

    current === "csv" ? "" : button("switch-csv", "csvMode", "quiet"),
    current === "append" ? "" : button("switch-append", "appendMode", "quiet"),
  ].join("");
}

function safeSpreadsheetCells(s: Session, headers?: string[], validate = true) {
  return new Map(
    [...spreadsheetRow(s, headers, validate)].map(([name, value]) => [
      name,
      spreadsheetText(value),
    ]),
  );
}

function appendPlan(s: Session, state: AppendSession) {
  const data = state.data!;
  return planCSVAppend(
    state.destination!.content,
    data,
    safeSpreadsheetCells(s, data.headers),
    parseSource(s.template.content).append?.duplicateKey,
  );
}

function appendView(s: Session) {
  const state = appendStates.get(s)!;
  const target = state.destination;
  const headers = state.data?.headers;
  let plan: ReturnType<typeof appendPlan> | undefined;
  let visible = new Map<string, string>();
  let error = "";
  try {
    visible = safeSpreadsheetCells(s, undefined, false);
    if (target) plan = appendPlan(s, state);
  } catch (reason) {
    error = errorText(reason);
  }
  const written = !!plan && state.written === JSON.stringify(plan.cells);
  const enabled = !!plan && !written;
  const details = headers
    ? headers.map((header) => [header, visible.get(header) ?? ""] as const)
    : [...visible];
  const unused =
    headers && [...visible.keys()].filter((name) => !headers.includes(name));
  const duplicate =
    plan?.duplicate && !written
      ? state.data?.rows[plan.duplicate - 1]
      : undefined;
  return `<main class="capture-panel append-panel"><header class="scanner-header">
    <h1>${esc(s.template.name)}</h1>
    <div class="toolbar">${sourceModeButtons("append")}</div>
    ${outputSelector(s)}
  </header>
  <h2>${esc(t("appendReview"))}</h2>
  <div class="toolbar">${button("append-choose", target ? "appendChangeFile" : "appendChooseFile", "quiet")}</div>
  ${target ? `<p class="append-destination">${esc(target.name)}</p>` : ""}
  ${state.receipt ? `<p role="status">${esc(t("appendReceipt"))} ${state.receipt.row} · ${esc(state.receipt.name)}</p>` : ""}
  ${
    duplicate
      ? `<details><summary>${esc(t("appendDuplicate"))} ${plan!.duplicate}</summary>
    <dl class="append-cells">${headers!.map((header, index) => `<dt>${esc(header)}</dt><dd>${esc(duplicate[index])}</dd>`).join("")}</dl>
  </details>`
      : ""
  }
  ${error ? `<p role="status">${esc(error)}</p>` : ""}
  ${unused?.length ? `<p class="hint">${esc(t("appendUnmapped"))} ${esc(unused.join(", "))}</p>` : ""}
  <dl class="append-cells">${details.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>
  ${s.unifiedForm ? formAttentionView(s, true, headers) : ""}
  <div class="toolbar">
    ${button("append-write", "appendWrite", "primary", !enabled)}
    ${button("append-write-next", "appendWriteNext", "", !enabled)}
    ${written ? button("append-next", "appendNext", "") : ""}
    ${button("copy-spreadsheet-row", "copySpreadsheetRow", "quiet", !details.length)}
    ${button("cancel-session", "closeSession", "quiet")}
  </div></main>`;
}

async function chooseAppendDestination(s: Session, linked = false) {
  const metadata = parseSource(s.template.content).append;
  const destination = await platform.pickAppendCSV(
    linked ? templateDocuments.get(s)?.recentToken : undefined,
    linked ? metadata?.file : undefined,
  );
  if (!destination) return;
  let data: CSVRecords;
  try {
    data = csvRecords(destination.content, true);
  } catch (error) {
    appendStates.set(s, {});
    render();
    throw error;
  }
  const previous = appendStates.get(s)!;
  appendStates.set(s, {
    destination,
    data,
    ...(previous.destination?.name === destination.name
      ? { receipt: previous.receipt, written: previous.written }
      : {}),
  });
  message = "";
  render();
  focus("append-choose");
}

async function copySpreadsheetRow(s: Session) {
  const state = appendStates.get(s);
  const headers = state?.data?.headers;
  const explicit = selectedSourceOutput(s).row;
  const ordered =
    headers &&
    (!explicit || explicit.every((column) => headers.includes(column.id)));
  const cells = safeSpreadsheetCells(s, ordered ? headers : undefined);
  const values = ordered
    ? headers!.map((header) => cells.get(header) ?? "")
    : [...cells.values()];
  if (!values.some((value) => value.trim())) throw Error("appendEmptyRow");
  await copyTask(delimitedRow(values, "\t"), t("copySpreadsheetRow"));
  notify("copied");
}

async function commitAppend(s: Session, next: boolean) {
  const state = appendStates.get(s)!;
  const plan = appendPlan(s, state);
  const signature = JSON.stringify(plan.cells);
  if (state.written === signature) return;
  if (
    plan.duplicate &&
    !(await confirmAction(
      "appendDuplicateConfirm",
      `${t("appendDuplicate")} ${plan.duplicate}`,
      t("appendWrite"),
    ))
  )
    return;
  await platform.appendCSVRow(state.destination!.token, plan.suffix);
  state.destination!.content += plan.suffix;
  state.data!.rows.push(plan.cells);
  state.receipt = { name: state.destination!.name, row: plan.row };
  state.written = signature;
  csvCache.delete(s);
  if (next) {
    await startNextAppendRecord(s);
  } else {
    render();
    focus("append-next");
  }
}

async function startNextAppendRecord(s: Session) {
  const state = appendStates.get(s)!;
  const keep = new Set(parseSource(s.template.content).append?.carryForward);
  s.fields = s.fields.map((field) => {
    const value = keep.has(field.name)
      ? field.value
      : (s.controls?.get(field.name)?.defaultValue ?? null);
    return {
      name: field.name,
      value,
      status: value === null ? "empty" : "captured",
    };
  });
  s.active = 0;
  if (s.sourceContext)
    s.sourceContext = { timestamp: new Date(), templateName: s.template.name };
  delete state.written;
  taskGeneration++;
  manualDrafts.clear();
  await switchSourceMode(s.typing ? "form" : "scanner");
  message = `${t("appendReceipt")} ${state.receipt!.row} · ${state.receipt!.name}`;
  failure = false;
  render();
  focus(
    s.typing ? controlFocus(`form-field-${s.active}`) : focusSourceScanner(),
  );
}

async function switchTemplateView(form: boolean) {
  const s = session!;
  if (s.unifiedForm) form = true;
  await platform.compact(!form, library.preferences.alwaysOnTop, form);
  const shortcutError = await configureSessionShortcuts(!form);
  prepareWorkflow(s, form);
  typingCheck = false;
  reverification = null;
  templateForm = form;
  if (lastTemplate) lastTemplate.typing = form;
  preview = false;
  message = "";
  render();
  if (form && sessionSteps(s)) focusStepField(s);
  else if (form) focus(controlFocus(`form-field-${s.active}`));
  else if (!s.fields[s.active]) focus("finish");
  else if (s.fields[s.active].value !== null) focus(`field-${s.active}`);
  else if (s.template.placeholderStyle === "source")
    focus(focusSourceScanner());
  else focus("switch-form");
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
          text: parts
            .map((part) => part.text)
            .join(selectedSourceOutput(s).delivery.separator),
        },
      ]
    : (pasteOrder?.map((index) => parts[index]) ?? parts);
}
// Keep exports in template order. Grouping still saves one block when explicitly selected.
function exportSections(s: Session) {
  return groupSections && s.prepared
    ? deliveredSections(s)
    : (s.prepared ?? prepareSections(s));
}
function sectionNavigation(
  s: Session,
  parts: NonNullable<Session["prepared"]>,
  index: number,
) {
  if (index === parts.length - 1 || groupSections || pasteOrder) return false;
  const configured = selectedSourceOutput(s).delivery.after.get(
    parts[index].id,
  );
  return configured ?? sectionTab;
}
function sectionOrderView(parts: NonNullable<Session["prepared"]>) {
  return `<div id="section-order-panel" class="section-order-panel">
    <p class="hint">${esc(t("sectionOrderHelp"))}</p>
    <ol class="section-order-list" aria-label="${esc(t("sectionOrder"))}">
      ${parts
        .map(
          (part, index) => `
        <li><span>${esc(part.label)}</span>
          <button id="section-order-${index}-up" data-order-index="${index}" data-order-move="-1" aria-label="${esc(t("moveUp") + " " + part.label)}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button id="section-order-${index}-down" data-order-index="${index}" data-order-move="1" aria-label="${esc(t("moveDown") + " " + part.label)}" ${index === parts.length - 1 ? "disabled" : ""}>↓</button>
        </li>`,
        )
        .join("")}
    </ol>
    ${button("reset-section-order", "resetSectionOrder", "quiet", !pasteOrder)}
  </div>`;
}
function sectionDeliveryView(s: Session) {
  const steps = sessionSteps(s);
  const stepIndex = s.stepIndex ?? 0;
  const csv = csvSessions.get(s);
  const pickers = (csv ? csvSelector(s, csv) : "") + outputSelector(s);
  if (csv?.error)
    return `<main class="capture-panel delivery-panel">
      <header class="scanner-header"><h1>${esc(t("outputHeading"))}</h1>${pickers}</header>
      <p role="alert">${esc(csv.error)}</p>
      <div class="toolbar delivery-exit">${sourceModeButtons("csv")}${button("use-csv-row", "useCSVRow", "quiet")}${button("pause-task", "pauseTask", "quiet")}${button("cancel-session", "closeSession", "quiet")}</div>
    </main>`;
  const parts = deliveredSections(s),
    index = s.deliveryIndex ?? 0;
  const navigation = sectionNavigation(s, parts, index);
  const keys =
    typeof navigation === "boolean"
      ? navigation
        ? "Tab"
        : ""
      : navigation.join(" → ");
  return `<main class="capture-panel delivery-panel">
    <header class="scanner-header"><h1>${esc(t("outputHeading"))}</h1>${steps ? stepHeading(s, steps) : ""}${pickers}<p class="task-progress" role="status">${esc(parts[index].label)} · ${index + 1}/${parts.length}</p></header>
    ${outputInstructions(s.template, s.outputId)}
    <pre class="output delivery-text" tabindex="0">${esc(parts[index].text)}</pre>
    <div class="toolbar delivery-primary">${button("copy-section", "copySection", "primary")}${s.prepared!.length > 1 && !groupSections ? button("copy-output", "copyEntireOutput") : ""}${button("save-sections", "saveSections", "quiet")}</div>
    <p class="hint">${esc(t("sectionDeliveryHelp"))} <kbd>${esc(keyLabel(library.preferences.shortcuts.finish))}</kbd></p>
    ${lastStep ? lastStepView() : ""}
    ${steps ? stepWarnings(s) : ""}
    ${parts.length > 1 ? `<div class="toolbar delivery-navigation">${button("section-prev", "emailManualBack", "", index === 0 && !s.deliveryDone)}${button("section-next", "emailManualNext", "", index === parts.length - 1)}</div>` : ""}
    ${
      s.prepared!.length > 1
        ? `<details id="paste-options" ${pasteOptionsOpen ? "open" : ""}><summary>${esc(t("pasteOptions"))}</summary>
      <button id="reorder-sections" aria-expanded="${sectionOrderOpen}" ${sectionOrderOpen ? 'aria-controls="section-order-panel"' : ""} ${groupSections ? "disabled" : ""}>${esc(t("reorderSections"))}</button>
      ${sectionOrderOpen ? sectionOrderView(parts) : ""}
      <fieldset class="section-delivery-settings" ${pasteOrder ? "disabled" : ""}>
        ${check("group-sections", "groupSections", groupSections)}${check("section-tab", "sectionTab", !pasteOrder && sectionTab)}
        <label for="delivery-mode">${esc(t("deliveryMode"))}</label><select id="delivery-mode" ${groupSections ? "disabled" : ""}><option value="step" ${pasteOrder || deliveryMode === "step" ? "selected" : ""}>${esc(t("deliveryStep"))}</option><option value="sequence" ${!pasteOrder && deliveryMode === "sequence" ? "selected" : ""}>${esc(t("deliverySequence"))}</option></select>
      </fieldset>
    </details>`
        : ""
    }
    ${pasteOrder ? `<p class="hint" role="status">${esc(t("manualSectionOrder"))}</p>` : ""}
    ${parts.length > 1 && !s.deliveryDone ? `<p class="hint">${esc(t("afterSection"))} ${esc(keys || t("noNavigation"))}</p>` : ""}
    <div class="toolbar delivery-exit">${
      csv
        ? sourceModeButtons("csv") +
          button("use-csv-row", "useCSVRow", "quiet", !!csv.error)
        : button("section-edit", "returnToFilledForm", "quiet") +
          (steps
            ? (stepIndex > 0
                ? button("step-previous", "formStepPrevious", "quiet")
                : "") +
              (stepIndex < steps.length - 1
                ? button("step-next", "formStepNext")
                : "")
            : button("switch-csv", "csvMode", "quiet") +
              button("switch-append", "appendMode", "quiet"))
    }${button("pause-task", "pauseTask", "quiet")}${button("cancel-session", "closeSession", "quiet")}</div>
  </main>`;
}
function emailDeliveryView(s: Session) {
  const parts = renderEmail(s),
    index = s.deliveryIndex ?? 0;
  const { shortcuts } = library.preferences;
  return `<main class="capture-panel delivery-panel">
    <header class="scanner-header"><h1>${esc(t("emailDelivery"))}</h1><p class="task-progress" role="status">${esc(t(parts[index].key))} · ${index + 1}/${parts.length}</p></header>
    <pre class="output delivery-text" tabindex="0">${esc(parts[index].text)}</pre>
    <div class="toolbar delivery-primary">${button("email-copy", "emailCopy", s.deliveryDone ? "" : "primary")}${button("email-done", "emailDone", s.deliveryDone ? "primary" : "quiet", !s.deliveryDone)}</div>
    <div class="toolbar delivery-navigation">${button("email-back", "emailManualBack", "", index === 0)}${button("email-next", "emailManualNext", "", !!s.deliveryDone)}</div>
    ${s.deliveryDone ? `<p role="status">${esc(t("emailBodyPasted"))}</p>` : ""}
    ${focusedWorkflow ? lastStepView() + `<ol class="email-checklist" aria-label="${esc(t("emailOrder"))}">${parts.map((part, i) => `<li ${index === i ? 'aria-current="step"' : ""}><strong>${esc(t(part.key))}</strong> · ${esc(t(emailSteps.get(part.key) ?? "transferPending"))}</li>`).join("")}</ol>` : ""}
    <details><summary>${esc(t("pasteOptions"))}</summary><p>${esc(t("emailDeliveryHelp"))}</p><p><kbd>${esc(keyLabel(shortcuts.finish))}</kbd> ${esc(t("emailPasteNext"))}</p><p><kbd>${esc(keyLabel(shortcuts.previous))}</kbd> ${esc(t("emailGoBack"))}</p><p>${esc(t("emailBackHelp"))}</p></details>
    <div class="toolbar delivery-exit">${button("pause-task", "pauseTask", "quiet")}${button("cancel-session", "cancelSession", "quiet")}</div>
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

function sourceScannerChoice(s: Session) {
  return (
    s.template.placeholderStyle === "source" &&
    !!s.controls?.get(s.fields[s.active]?.name)?.options
  );
}
function focusSourceScanner() {
  if (session?.mode === "ready") return "finish";
  if (session && sourceScannerChoice(session))
    return controlFocus("scanner-control");
  if (!document.querySelector("#manual-entry[open]"))
    return document.getElementById("scanner-control")
      ? controlFocus("scanner-control")
      : "mouse-transfer";
  return !manualOpen && document.getElementById("scanner-control")
    ? controlFocus("scanner-control")
    : "manual-value";
}

function sourceScannerView(s: Session) {
  const field = s.fields[s.active];
  const checking = s.mode === "verify";
  const choice = sourceScannerChoice(s);
  const ready = s.mode === "ready";
  const active = activeSourceFields(s);
  const showPreview = !library.preferences.hideLivePreview;
  const status = (entry: Session["fields"][number]) =>
    esc(t(entry.status === "verified" ? "matchedSource" : entry.status));
  return `<main class="capture-panel source-scanner">
    <header class="scanner-header">
      <h1>${esc(s.template.name)}</h1>
      ${templateInstructions(s)}
      <p class="task-progress" role="status">${esc(progressText(s))}</p>
      ${checking && s.verificationOutputOnly ? "" : outputSelector(s)}
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
            ${
              choice
                ? ""
                : `<details id="manual-entry" ${manualOpen || ((!desktop || !mouseMode) && !s.controls?.has(field.name)) ? "open" : ""}>
              <summary>${esc(t(s.controls?.has(field.name) ? "clipboard" : "manualEntry"))}</summary>
              <form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label>${manualValueEditor(s)}
              <div class="toolbar">${button("apply-value", checking ? "compare" : "apply", "primary")}${button("use-clipboard", "clipboard")}</div></form>
            </details>`
            }
            <div class="toolbar scanner-navigation">${!choice && mouseMode ? button("mouse-transfer", checking ? "compareSelection" : "transfer", "primary", !desktop) : ""}${button("previous", "previous")}${button("next", "next")}</div>`
              : `<div class="toolbar">${button("finish", "prepareSections", "primary")}</div>`
          }
        </section>
        <section class="scanner-fields" aria-labelledby="scanner-fields-heading">
          <div class="scanner-fields-heading">
            <h2 id="scanner-fields-heading">${esc(t("fields"))}</h2>
            ${field?.value != null ? button("source-copy-field", "copyField", "quiet") : ""}
          </div>
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
          ${!ready && !checking && parseSource(s.template.content).outputs.length > 1 ? button("finish", "prepareSections") : ""}
          ${button("batch-compare", "batchCompare", "quiet")}${button("save-record", "saveRecord", "quiet")}
          ${sourceModeButtons("scanner")}
          ${button("pause-task", "pauseTask", "quiet")}
          ${button("cancel-session", "closeSession", "quiet")}
        </div>
      </div>
      ${showPreview ? `<aside class="scanner-preview sticky-preview">${outputPreview(s.template, s)}</aside>` : ""}
    </div>
  </main>`;
}
function snippetCollectionView(s: Session) {
  const actions = parseSource(s.template.content).outputs;
  return `<main class="capture-panel snippet-collection">
    <h1>${esc(s.template.name)}</h1>
    <p class="hint">${esc(t("snippetCollectionHelp"))}</p>
    <div class="snippet-action-list">${actions
      .map(
        ({ label }, index) =>
          `<button id="snippet-run-${index}" data-collection-action="${index}">${esc(label)}</button>`,
      )
      .join("")}</div>
    <div class="actions">${button("snippet-close", "closeSession", "quiet")}</div>
  </main>`;
}

async function manualSnippetText() {
  const entry = await formDialog(
    t("snippetPasteTitle"),
    [{ key: "text", label: t("snippetPasteLabel"), lines: true }],
    t("snippetCopyAction"),
    t("cancel"),
    ({ text }) => (text.trim() ? null : t("emptySelection")),
  );
  return entry?.text;
}

async function snippetClipboardText() {
  try {
    const value = await platform.readClipboard();
    if (value.trim()) return value;
  } catch {
    // A native clipboard restriction still allows manual input in the snippet.
  }
  return manualSnippetText();
}

async function copySnippetAction(s: Session, index: number) {
  const source = parseSource(s.template.content);
  const action = source.outputs[index];
  const context: TemplateContext = {
    timestamp: new Date(),
    templateName: s.template.name,
  };
  const renderAction = () =>
    sourceParts(source, new Map(), undefined, action.id, context)[0].parts;
  const missing = new Set(
    renderAction()
      .filter((part) => part.missing)
      .map((part) => part.text),
  );
  const selectionOnly = missing.has("{{@selection}}");
  const selectionFallback = missing.has("{{@selection-or-clipboard}}");
  if (selectionOnly || selectionFallback) {
    try {
      const selection = await platform.mouseTransfer(true);
      if (!selection.trim()) throw Error("emptySelection");
      context.selection = selection;
      context.selectionOrClipboard = selection;
    } catch (error) {
      const choice = await actionDialog(
        "snippetSelectionUnavailable",
        `<p>${esc(errorText(error))}</p>`,
        `<button value="cancel" autofocus>${esc(t("cancel"))}</button>
        <button value="manual">${esc(t("snippetPasteTitle"))}</button>
        ${selectionFallback ? `<button value="clipboard" class="primary">${esc(t("clipboard"))}</button>` : ""}`,
      );
      if (choice === "clipboard") {
        context.clipboard = await snippetClipboardText();
        context.selectionOrClipboard = context.clipboard;
      } else if (choice === "manual") {
        const value = await manualSnippetText();
        context.selection = value;
        context.selectionOrClipboard = value;
      } else return;
      if (
        selectionOnly &&
        context.selection === undefined &&
        context.selectionOrClipboard !== undefined
      )
        context.selection = await manualSnippetText();
      if (
        (selectionOnly && context.selection === undefined) ||
        (selectionFallback && context.selectionOrClipboard === undefined)
      )
        return;
    }
  }
  if (missing.has("{{@clipboard}}") && context.clipboard === undefined) {
    context.clipboard = await snippetClipboardText();
    if (context.clipboard === undefined) return;
  }
  const result = renderAction();
  if (result.some((part) => part.missing)) throw Error("missingValue");
  const text = result.map((part) => part.text).join("");
  if (!text) throw Error("emptySelection");
  try {
    await copyTask(text, action.label);
    notify("copied");
  } catch (error) {
    await actionDialog(
      "snippetCopyUnavailable",
      `<p>${esc(errorText(error))}</p><label for="snippet-copy-text">${esc(t("snippetOutputLabel"))}</label><textarea id="snippet-copy-text" readonly rows="5" autofocus>${esc(text)}</textarea>`,
      `<button value="close">${esc(t("done"))}</button>`,
    );
  }
}

function sessionView(): string {
  if (!session) return "";
  const s = session,
    p = library.preferences,
    f = s.fields[s.active];
  if (isSnippetCollection(s)) return snippetCollectionView(s);
  if (appending.has(s)) return appendView(s);
  if (s.mode === "delivery") {
    return s.prepared ? sectionDeliveryView(s) : emailDeliveryView(s);
  }
  if (templateFormActive()) return templateFormView(s);
  if (s.template.placeholderStyle === "source") return sourceScannerView(s);
  if (focusedWorkflow && !["review", "complete"].includes(s.mode))
    return focusedSessionView(s);
  if (s.mode === "review")
    return `<main class="capture-panel"><h1>✓ ${esc(t(s.template.email?.enabled ? "emailDone" : "complete"))}</h1><p>${esc(t(s.template.email?.enabled ? "emailReviewHelp" : "extraFieldsReviewHelp"))}</p><div class="actions">${button("email-to-scanner", "emailToScanner", "primary")}${button("email-clear-close", "clearClose", "danger") + button("close-session", "closeSession")}</div>${!p.clearAfterCompletion ? outputPreview(s.template, s) + button("retain-email-results", "closeSession") : ""}${sessionRecovery(s)}</main>`;
  if (s.mode === "complete")
    return `<main class="capture-panel"><p class="eyebrow">${esc(t("app"))}</p><h1>✓ ${esc(t(s.template.email?.enabled ? "emailDone" : "complete"))}</h1><p>${esc(t(s.template.email?.enabled ? "emailFinished" : "copied"))}</p><p class="muted">${esc(t(p.clearAfterCompletion || !s.fields.some((f) => f.value !== null) ? "erased" : "retained"))}</p>${button("close-session", returnToScanner ? "returnScanner" : "closeSession", "primary")}${!p.clearAfterCompletion && !s.scanner && s.fields.some((f) => f.value !== null) ? outputPreview(s.template, s) + button("erase-results", "eraseSession", "quiet danger") : ""}${sessionRecovery(s)}</main>`;
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
  return `<main class="capture-panel ${s.scanner ? "scanner-panel" : ""}"><div class="section-head session-heading"><h1>${esc(s.scanner ? t("scanner") : s.template.name)}</h1>${!s.scanner ? button("switch-form", "fillForm") : ""}${button("toggle-workflow", "focusedView")}${button("pause-task", "pauseTask")}${button("session-back", "recentForms")}</div><p class="eyebrow" role="status">${esc(t(s.mode))} · ${done}/${s.fields.length}</p>
  ${s.scanner ? '<div class="scanner-layout free-scanner-layout"><div class="scanner-work">' : ""}
  ${s.scanner ? `<p class="vera-id">${esc(s.scannerId)}</p><p class="hint">${esc(t("scannerTemporary"))}</p>` : ""}
  ${f && s.controls?.has(f.name) ? activeScannerControl(s) : ""}
  ${s.mode !== "ready" && f ? `<details id="manual-entry" ${manualOpen ? "open" : ""}><summary>${esc(t("manualEntry"))}</summary><form id="manual-form"><label for="manual-value">${esc(t("manual"))}</label>${manualValueEditor(s)}<div class="toolbar">${button("apply-value", mode === "verify" ? "compare" : "apply", "primary")}${button("use-clipboard", "clipboard")}</div></form>${!s.scanner ? `<p class="hint">${esc(t("clipboardHelp"))}</p>` : ""}</details>` : ""}
  ${mouseMode ? `<div class="toolbar">${button("mouse-back", "previous")}${button("mouse-transfer", "transfer", "primary", s.mode === "ready")}${button("mouse-forward", "next")}</div>` : ""}
  <details id="session-options" class="session-options" ${sessionOptionsOpen ? "open" : ""}><summary>${esc(t("sessionOptions"))}</summary><p class="hint">${esc(t(mode === "verify" ? "verifyHelp" : "captureHelp"))}</p><kbd>${esc(keyLabel(p.shortcuts[mode]))}</kbd>
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
  <details><summary>${esc(t("help"))}</summary><dl class="shortcut-list">${actions.map((a) => `<dt>${esc(t(a === "cancel" ? "cancelSession" : a))}</dt><dd><kbd>${esc(keyLabel(p.shortcuts[a]))}</kbd></dd>`).join("")}</dl></details>
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
    if (
      s.scanner ||
      (s.template.placeholderStyle === "source" && s.mode === "ready")
    )
      s.mode = "capture";
  }
  if (
    focusedWorkflow &&
    s.scanner &&
    (keepChecking || s.fields[index]?.value === null)
  )
    manualOpen = true;
}
async function editSourceResponses(s: Session) {
  await switchTemplateView(s.typing === true);
  delete s.prepared;
}
async function batchCompare(s: Session) {
  const active = activeSourceFields(s);
  const entries = s.fields.flatMap((field) =>
    fieldVisible(s, field.name, active) && field.value?.trim()
      ? [
          {
            name: field.name,
            label: fieldLabel(s, field.name),
            aliases: s.controls?.get(field.name)?.aliases,
            value: field.value,
          },
        ]
      : [],
  );
  if (!entries.length) throw Error("noValue");
  const input = await formDialog(
    t("batchCompare"),
    [{ key: "source", label: t("batchSource"), lines: true }],
    t("compare"),
    t("keep"),
    ({ source }) =>
      !source.trim() || source.length > 65536 ? t("batchSourceLimit") : null,
  );
  if (!input) return;
  const results = compareSourceText(
    entries,
    input.source,
    s.template.comparison,
  );
  await actionDialog(
    "batchCompare",
    `<p class="hint">${esc(t("batchEvidenceHelp"))}</p><details><summary>${esc(t("batchSource"))}</summary><pre class="output">${esc(input.source)}</pre></details><dl>${results
      .map(
        ({ label, value, status, evidence }) =>
          `<dt>${esc(label)} · ${esc(t(status))}</dt><dd><pre>${esc([value, ...evidence.slice(0, 3)].map((text) => text.slice(0, 500)).join("\n"))}</pre></dd>`,
      )
      .join("")}</dl>`,
    `<button value="done" autofocus>${esc(t("keep"))}</button>`,
  );
}

function adjacentOutput(s: Session, step: -1 | 1) {
  const outputs = availableOutputs(s);
  const current = outputs.findIndex(
    (output) => output.id === selectedSourceOutput(s).id,
  );
  return outputs[(current + step + outputs.length) % outputs.length].id;
}

function resetOutputOptions(s: Session) {
  groupSections = false;
  pasteOrder = null;
  sectionOrderOpen = false;
  sectionTab = library.preferences.tabBetweenSections === true;
  deliveryMode = selectedSourceOutput(s).delivery.mode;
}

function renderCSVSelection(s: Session, csv: CSVSession, focusId: string) {
  resetOutputOptions(s);
  prepareCSVRow(s, csv);
  lastStep = null;
  message = "";
  render();
  focus(focusId);
}

function selectCSVRow(row: number, step?: -1 | 1) {
  const s = session!;
  const csv = csvSessions.get(s)!;
  if (!Number.isInteger(row)) return;
  if (row < 0 || row >= csv.data.rows.length) {
    if (step === undefined) return;
    s.outputId = adjacentOutput(s, step);
    row = row < 0 ? csv.data.rows.length - 1 : 0;
  }
  csv.row = row;
  renderCSVSelection(
    s,
    csv,
    step ? `csv-row-${step < 0 ? "previous" : "next"}` : "csv-row",
  );
}

async function selectOutput(outputId: string, focusId = "source-output") {
  const s = session!;
  const csv = csvSessions.get(s);
  if (appending.has(s)) {
    s.outputId = outputId;
    render();
    focus(focusId);
    return;
  }
  if (csv) {
    s.outputId = outputId;
    renderCSVSelection(s, csv, focusId);
    return;
  }
  // Validate a new output before replacing the currently prepared text.
  const prepared =
    s.mode === "delivery" ? prepareSections({ ...s, outputId }) : undefined;
  s.outputId = outputId;
  resetOutputOptions(s);
  if (prepared) {
    s.prepared = prepared;
    noteStepPrepared(s);
    s.deliveryIndex = 0;
    s.deliveryDone = false;
    lastStep = null;
    message = "";
    render();
    focus(focusId);
    await rememberOutput(s, sectionText(prepared));
    return;
  }
  const panel = document.getElementById("form-output");
  if (panel) {
    if (!panel.hidden) panel.innerHTML = outputPreview(s.template, s);
    root.querySelector<HTMLSelectElement>("#source-output")!.value = outputId;
    if (s.unifiedForm) refreshFormAttention(s);
  } else {
    render();
  }
  focus(focusId);
}

function nextFormAttention(from: number, row = false) {
  const s = session!;
  const pending = formAttention(
    s,
    row,
    row ? appendStates.get(s)?.data?.headers : undefined,
  );
  return (pending.find(({ index }) => index > from) ?? pending[0])?.index;
}

async function goToFormAttention(index: number | undefined) {
  if (index === undefined) return;
  const s = session!;
  if (appending.has(s)) await switchSourceMode("form");
  const owner = sessionSteps(s)?.findIndex((step) =>
    step.fields.includes(s.fields[index].name),
  );
  if (owner !== undefined && owner >= 0 && owner !== s.stepIndex)
    await openFormStep(s, owner);
  focusFormField(index);
}

function refreshFormAttention(s: Session) {
  const section = document.getElementById("form-attention");
  if (section) section.innerHTML = formAttentionView(s);
}

function bindUnifiedForm(s: Session) {
  const panel = root.querySelector(".unified-form, .append-panel");
  panel?.addEventListener("click", (event) => {
    const element = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!element) return;
    if (
      element.id === "form-next-attention" ||
      element.dataset.formAttention !== undefined
    ) {
      const index =
        element.dataset.formAttention === undefined
          ? nextFormAttention(s.active, appending.has(s))
          : Number(element.dataset.formAttention);
      void run(() => goToFormAttention(index));
    }
    const action = element.dataset.formFieldAction;
    if (!action) return;
    const index = Number(element.dataset.index);
    void run(async () => {
      if (action === "verify") return verifyFormField(s, index);
      if (action === "settings") return editAdHocField(s, index);
      if (action === "copy") return copySelectedField(s, index);
      const value = await platform.mouseTransfer(preserveClipboard);
      s.active = index;
      capture(s, value, false);
      render();
      focusFormField(index);
    });
  });
}

function recordImportError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const colon = message.indexOf(":");
  if (colon < 0) return errorText(error);
  const code = message.slice(0, colon);
  return code === "recordUnknownField" || code === "recordInvalidField"
    ? `${t(code)} ${message.slice(colon + 1)}`
    : errorText(error);
}

function currentRecordValue(value: string | null) {
  return value === null
    ? t("recordUnanswered")
    : value === ""
      ? t("recordEmptyValue")
      : value;
}

async function extractSource(s: Session) {
  const fields = candidateFields(s);
  let candidates: Map<string, Candidate> | undefined;
  await actionDialog(
    "extractSource",
    `<label for="extract-text">${esc(t("batchSource"))}</label>
     <textarea id="extract-text" rows="7" maxlength="${sourceTextLimit}" autofocus></textarea>
     <div class="toolbar">
       ${desktop ? '<button id="extract-capture" type="button">' + esc(t("captureSelected")) + "</button>" : ""}
       <button id="extract-clipboard" type="button">${esc(t("clipboard"))}</button>
       <button id="extract-open" type="button">${esc(t("openSourceText"))}</button>
     </div>
     <details><summary>${esc(t("candidateFileTools"))}</summary>
       <p class="hint">${esc(t("candidatePrivacy"))}</p>
       <div class="toolbar">
         <button id="extract-import" type="button">${esc(t("importCandidates"))}</button>
         <button id="extract-fields" type="button">${esc(t("exportExtractionFields"))}</button>
       </div>
     </details>
     <input id="extract-file" type="file" accept=".txt,text/plain" hidden>
     <input id="candidate-file" type="file" accept=".json,application/json" hidden>
     <p id="extract-error" role="alert"></p>`,
    `<button value="cancel">${esc(t("cancel"))}</button><button value="review" class="primary">${esc(t("findCandidates"))}</button>`,
    (dialog) => {
      const source =
        dialog.querySelector<HTMLTextAreaElement>("#extract-text")!;
      const error = dialog.querySelector<HTMLElement>("#extract-error")!;
      const textFile = dialog.querySelector<HTMLInputElement>("#extract-file")!;
      const candidateInput =
        dialog.querySelector<HTMLInputElement>("#candidate-file")!;
      let reading = false;
      const safely = async (work: () => Promise<void>) => {
        if (reading) return;
        reading = true;
        error.textContent = "";
        try {
          await work();
        } catch (reason) {
          error.textContent = recordImportError(reason);
        } finally {
          reading = false;
        }
      };
      const setSource = (text: string) => {
        if (!validSourceText(text)) throw Error("batchSourceLimit");
        if (!dialog.open) return;
        source.value = text;
        source.focus();
      };
      const readText = async (file: File) => {
        if (!/\.txt$/i.test(file.name)) throw Error("sourceTextFileType");
        if (file.size > sourceTextLimit * 4) throw Error("batchSourceLimit");
        setSource(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          ),
        );
      };
      dialog.querySelector<HTMLElement>("#extract-open")!.onclick = () =>
        textFile.click();
      dialog.querySelector<HTMLElement>("#extract-import")!.onclick = () =>
        candidateInput.click();
      const captureButton =
        dialog.querySelector<HTMLElement>("#extract-capture");
      if (captureButton)
        captureButton.onclick = () =>
          void safely(async () =>
            setSource(await platform.mouseTransfer(preserveClipboard)),
          );
      dialog.querySelector<HTMLElement>("#extract-clipboard")!.onclick = () =>
        void safely(async () => setSource(await platform.readClipboard()));
      dialog.querySelector<HTMLElement>("#extract-fields")!.onclick = () =>
        void safely(async () => {
          await platform.exportTemplates(
            JSON.stringify(extractionFields(s), null, 2) + "\n",
            "veraflow-extraction-fields.json",
          );
        });
      textFile.onchange = () => {
        const file = textFile.files?.[0];
        textFile.value = "";
        if (file) void safely(() => readText(file));
      };
      candidateInput.onchange = () => {
        const file = candidateInput.files?.[0];
        candidateInput.value = "";
        if (file)
          void safely(async () => {
            if (file.size > candidateFileLimit) throw Error("candidateLimit");
            const text = new TextDecoder("utf-8", { fatal: true }).decode(
              await file.arrayBuffer(),
            );
            if (!dialog.open) return;
            candidates = importCandidateFile(
              fields,
              text,
              source.value.trim() ? source.value : undefined,
            );
            dialog.close("review");
          });
      };
      dialog.ondragover = (event) => {
        if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
      };
      dialog.ondrop = (event) => {
        if (!event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files.length !== 1) {
          error.textContent = t("sourceTextFileType");
          return;
        }
        const file = files[0];
        void safely(() => readText(file));
      };
      dialog.querySelector("form")!.onsubmit = (event) => {
        if ((event.submitter as HTMLButtonElement | null)?.value === "cancel")
          return;
        event.preventDefault();
        if (reading) return;
        try {
          candidates = extractCandidates(fields, source.value);
          dialog.close("review");
        } catch (reason) {
          error.textContent = recordImportError(reason);
        }
      };
    },
  );
  if (candidates) await reviewCandidates(s, candidates);
}

async function reviewCandidates(
  s: Session,
  candidates: ReadonlyMap<string, Candidate>,
) {
  const rows = s.fields.flatMap((field, index) => {
    const candidate = candidates.get(field.name);
    return candidate && candidate.status !== "not_found"
      ? [{ field, index, candidate }]
      : [];
  });
  if (!rows.length) {
    notify("noCandidates");
    return;
  }
  const missing = s.fields.filter(
    ({ name }) =>
      !candidates.has(name) || candidates.get(name)?.status === "not_found",
  );
  const statusKeys = {
    found: "candidateFound",
    ambiguous: "candidateAmbiguous",
    invalid: "candidateInvalid",
    not_found: "batchMissing",
  } as const;
  let changes: ReturnType<typeof planRecordValues> = [];
  const choice = await actionDialog(
    "reviewCandidates",
    `<p class="hint">${esc(t("candidateReviewHelp"))}</p>
     ${rows
       .map(({ field, index, candidate }) => {
         const proposed =
           candidate.status === "found" ? candidate.alternatives[0].value : "";
         const same = proposed !== "" && field.value === proposed;
         const status =
           candidate.status === "found" && field.value !== null
             ? same
               ? "candidateSame"
               : "candidateConflict"
             : statusKeys[candidate.status];
         const label = fieldLabel(s, field.name);
         return `<fieldset class="candidate-field" data-candidate-row="${index}">
         <legend>${esc(label)}</legend>
         <p class="hint">${esc(t(status))}</p>
         <p>${esc(t("recordCurrent"))} <strong>${esc(currentRecordValue(field.value))}</strong></p>
         ${
           candidate.status === "ambiguous"
             ? `<label for="candidate-choice-${index}">${esc(t("chooseCandidate"))}</label>
            <select id="candidate-choice-${index}"><option value="">${esc(t("chooseValue"))}</option>
            ${candidate.alternatives.map(({ value }, option) => `<option value="${option}">${esc(value)}</option>`).join("")}</select>`
             : ""
         }
         <label for="candidate-value-${index}">${esc(t("recordIncoming"))}</label>
         <textarea id="candidate-value-${index}" rows="2" maxlength="8192">
${esc(proposed)}</textarea>
         <label class="check"><input id="candidate-accept-${index}" type="checkbox" ${candidate.status === "found" && field.value === null ? "checked" : ""}> ${esc(t("acceptCandidate"))} · ${esc(label)}</label>
         <details ${candidate.status !== "found" || (field.value !== null && !same) ? "open" : ""}><summary>${esc(t("candidateEvidence"))}</summary>
         ${candidate.alternatives
           .map(
             ({
               value,
               origin,
               evidence,
             }) => `<p><strong>${esc(value)}</strong> · ${esc(t(origin === "inferred" ? "candidateInferred" : "candidateDirect"))}</p>
           ${evidence.length ? evidence.map(({ quote, line, source_id }) => `<blockquote>${esc(quote)}${line || source_id ? `<small>${esc([source_id, line ? t("sourceLine") + " " + line : undefined].filter(Boolean).join(" · "))}</small>` : ""}</blockquote>`).join("") : `<p class="hint">${esc(t("candidateNoEvidence"))}</p>`}`,
           )
           .join("")}
         </details></fieldset>`;
       })
       .join("")}
      ${missing.length ? `<details><summary>${esc(t("batchMissing"))} (${missing.length})</summary><ul>${missing.map(({ name }) => `<li>${esc(fieldLabel(s, name))}</li>`).join("")}</ul></details>` : ""}
      <p class="hint">${esc(t("candidatePrivacy"))}</p>
      <p id="candidate-review-error" role="alert"></p>`,
    `<button value="cancel">${esc(t("cancel"))}</button>
     <button id="save-candidates" type="button">${esc(t("saveCandidates"))}</button>
     <button value="apply" class="primary">${esc(t("applyCandidates"))}</button>`,
    (dialog) => {
      const error = dialog.querySelector<HTMLElement>(
        "#candidate-review-error",
      )!;
      const valueInput = (index: number) =>
        dialog.querySelector<HTMLTextAreaElement>(`#candidate-value-${index}`)!;
      for (const { index, candidate } of rows) {
        const select = dialog.querySelector<HTMLSelectElement>(
          `#candidate-choice-${index}`,
        );
        if (select)
          select.onchange = () => {
            valueInput(index).value = select.value
              ? candidate.alternatives[Number(select.value)].value
              : "";
          };
      }
      dialog.querySelector<HTMLButtonElement>("#save-candidates")!.onclick =
        async (event) => {
          const button = event.currentTarget as HTMLButtonElement;
          button.disabled = true;
          error.textContent = "";
          try {
            const text =
              JSON.stringify(candidateFile(candidates), null, 2) + "\n";
            if (new TextEncoder().encode(text).length > candidateFileLimit)
              throw Error("candidateLimit");
            await platform.exportTemplates(text, "veraflow-candidates.json");
          } catch (reason) {
            error.textContent = recordImportError(reason);
          } finally {
            button.disabled = false;
          }
        };
      dialog.querySelector("form")!.onsubmit = (event) => {
        if ((event.submitter as HTMLButtonElement | null)?.value !== "apply")
          return;
        event.preventDefault();
        try {
          const values = new Map<string, string>();
          for (const { field, index } of rows)
            if (
              dialog.querySelector<HTMLInputElement>(
                `#candidate-accept-${index}`,
              )!.checked
            ) {
              const value = valueInput(index).value;
              if (!value.trim())
                throw Error("recordInvalidField:" + field.name);
              values.set(field.name, value);
            }
          if (!values.size) {
            error.textContent = t("selectCandidates");
            return;
          }
          changes = planRecordValues(s, values);
          dialog.close("apply");
        } catch (reason) {
          error.textContent = recordImportError(reason);
        }
      };
    },
  );
  if (choice !== "apply") return;
  if (changes.length) applyRecordChanges(s, changes);
  notify(changes.length ? "recordApplied" : "recordNoChanges");
  focus("extract-source");
}

async function importRecord(s: Session) {
  const text = await platform.importTemplates();
  if (text === null) return;
  let changes: ReturnType<typeof planRecordMerge>;
  try {
    changes = planRecordMerge(s, text);
  } catch (error) {
    const [key, ...name] = (error instanceof Error ? error.message : "").split(
      ":",
    );
    if (
      (key === "recordUnknownField" || key === "recordInvalidField") &&
      name.length
    ) {
      await actionDialog(
        "importRecord",
        `<p>${esc(t(key))} ${esc(name.join(":"))}</p>`,
        `<button value="done" autofocus>${esc(t("done"))}</button>`,
      );
      return;
    }
    throw error;
  }
  if (!changes.length) {
    notify("recordNoChanges");
    return;
  }
  const showValue = (value: string | null) => esc(currentRecordValue(value));
  const review = changes
    .map(
      ({ index, previous, value }) =>
        `<dt><strong>${esc(fieldLabel(s, s.fields[index].name))}</strong></dt>
      <dd><small>${esc(t("recordCurrent"))}</small><pre>${showValue(previous)}</pre>
      <small>${esc(t("recordIncoming"))}</small><pre>${showValue(value)}</pre></dd>`,
    )
    .join("");
  const choice = await actionDialog(
    "recordReview",
    `<dl class="record-import-review">${review}</dl>`,
    `<button value="cancel" autofocus>${esc(t("cancel"))}</button><button value="apply" class="primary">${esc(t("recordApply"))}</button>`,
  );
  if (choice !== "apply") return;
  applyRecordChanges(s, changes);
  notify("recordApplied");
  focus("import-record");
}

async function useCustomFormWithFile(s: Session) {
  const file = await platform.pickDocument(true);
  if (!file) return;
  const definition = documentTemplate(file);
  const source = parseSource(definition.content);
  if (source.snippets || source.workflow === "csv")
    throw Error("recordNeedsForm");
  const values = new Map(
    s.fields.flatMap(({ name, value }) =>
      value === null ? [] : [[name, value] as const],
    ),
  );
  await openDocumentTemplate(definition, values, file);
}

function bindSession() {
  if (session?.unifiedForm) bindUnifiedForm(session);
  if (session && isSnippetCollection(session)) {
    root
      .querySelectorAll<HTMLButtonElement>("[data-collection-action]")
      .forEach((action) => {
        click(action.id, () =>
          copySnippetAction(session!, Number(action.dataset.collectionAction)),
        );
      });
    click("snippet-close", closeSession);
    return;
  }
  click("source-copy-field", () =>
    copySelectedField(session!, session!.active),
  );
  click("step-previous", () => moveFormStep(-1));
  click("step-next", () => moveFormStep(1));
  click("prepare-step-outputs", () => perform("finish", false, true));
  click("batch-compare", () => batchCompare(session!));
  click("extract-source", () => extractSource(session!));
  click("import-record", () => importRecord(session!));
  click("custom-form-use-file", () => useCustomFormWithFile(session!));
  click("save-record", async () => {
    const s = session!;
    const values = Object.fromEntries(recordValues(s));
    await platform.exportTemplates(
      JSON.stringify(values, null, 2) + "\n",
      sourceFilename(s, "json"),
    );
  });
  on("source-output", "change", (event) => {
    const select = event.target as HTMLSelectElement;
    const outputId = select.value;
    if (busy) {
      select.value = selectedSourceOutput(session!).id;
      return;
    }
    void run(() => selectOutput(outputId));
  });
  on("csv-row", "change", (event) => {
    const row = Number((event.target as HTMLSelectElement).value);
    void run(() => selectCSVRow(row));
  });
  for (const [direction, step] of [
    ["previous", -1],
    ["next", 1],
  ] as const) {
    click(`source-output-${direction}`, () =>
      selectOutput(
        adjacentOutput(session!, step),
        `source-output-${direction}`,
      ),
    );
    click(`csv-row-${direction}`, () =>
      selectCSVRow(csvSessions.get(session!)!.row + step, step),
    );
  }
  click("copy-output", async () => {
    const s = session!;
    const text = s
      .prepared!.map((part) => part.text)
      .join(selectedSourceOutput(s).delivery.separator);
    await copyTask(text, selectedSourceOutput(s).label);
    noteStepTransfer(s);
    notify("copied");
    if (s.stepOutputs) focus("copy-output");
    await rememberOutput(s, sectionText(s.prepared!));
  });

  click("copy-section", async () => {
    const s = session!;
    const part = deliveredSections(s)[s.deliveryIndex ?? 0];
    await copyTask(part.text, part.label);
    noteStepTransfer(s, groupSections ? undefined : part.id);
    notify("copied");
    if (s.stepOutputs) focus("copy-section");
    await rememberOutput(session!, sectionText(session!.prepared!));
  });
  click("save-sections", async () => {
    const s = session!;
    if (await saveSectionText(s, exportSections(s)))
      await rememberOutput(s, sectionText(s.prepared!));
  });
  click("reorder-sections", () => {
    sectionOrderOpen = !sectionOrderOpen;
    pasteOptionsOpen = true;
    render();
    focus("reorder-sections");
  });
  click("reset-section-order", () => {
    pasteOrder = null;
    session!.deliveryIndex = 0;
    session!.deliveryDone = false;
    render();
    focus("reorder-sections");
  });
  root
    .querySelectorAll<HTMLButtonElement>("[data-order-move]")
    .forEach((item) => {
      click(item.id, () => {
        const s = session!;
        const index = Number(item.dataset.orderIndex);
        const offset = Number(item.dataset.orderMove);
        const target = index + offset;
        const length = s.prepared!.length;
        const order = pasteOrder ?? s.prepared!.map((_, index) => index);
        [order[index], order[target]] = [order[target], order[index]];
        pasteOrder = order;
        s.deliveryIndex = 0;
        s.deliveryDone = false;
        render();
        const moveUp = offset < 0 ? target > 0 : target === length - 1;
        focus(`section-order-${target}-${moveUp ? "up" : "down"}`);
      });
    });
  click("section-prev", () => perform("previous"));
  click("section-next", () => perform("next"));
  click("section-edit", () => editSourceResponses(session!));
  on("paste-options", "toggle", (event) => {
    const options = event.target as HTMLDetailsElement;
    if (options.isConnected) pasteOptionsOpen = options.open;
  });
  on("group-sections", "change", (event) => {
    groupSections = (event.target as HTMLInputElement).checked;
    sectionOrderOpen = false;
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
  click("switch-form", () =>
    session?.template.placeholderStyle === "source"
      ? switchSourceMode("form")
      : switchTemplateView(true),
  );
  click("switch-scanner", () =>
    session?.template.placeholderStyle === "source"
      ? switchSourceMode("scanner")
      : switchTemplateView(false),
  );
  click("switch-csv", () => switchSourceMode("csv"));
  click("switch-append", () => switchSourceMode("append"));
  click("use-csv-row", () => switchSourceMode("form", true));
  click("append-choose", () => chooseAppendDestination(session!));
  click("append-write", () => commitAppend(session!, false));
  click("append-write-next", () => commitAppend(session!, true));
  click("append-next", () => startNextAppendRecord(session!));
  click("copy-spreadsheet-row", () => copySpreadsheetRow(session!));
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
  click("reverify-form", () => {
    const s = session!;
    beginReverification(s, true);
    typingCheck = true;
    message = "";
    render();
    focus(controlFocus("typing-check"));
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
        previewPanel.innerHTML = s.scanner
          ? freeScannerPreview(s)
          : outputPreview(s.template, s);
      if (s.unifiedForm) refreshFormAttention(s);
      const warnings = document.getElementById("step-warnings");
      if (warnings) {
        const content = stepWarnings(s);
        if (warnings.innerHTML !== content) warnings.innerHTML = content;
      }
      const progress = root.querySelector(".template-form .task-progress");
      if (progress) progress.textContent = progressText(s);
      const reverify = root.querySelector<HTMLButtonElement>("#reverify-form");
      if (reverify)
        reverify.disabled = !s.fields.some(
          (field) => field.value?.trim() && fieldVisible(s, field.name, active),
        );
    };
    root
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(".template-form [data-control]")
      .forEach((input) => {
        if (input instanceof HTMLTextAreaElement) {
          input.addEventListener("blur", () => {
            const s = session!;
            const field = s.fields[Number(input.dataset.control)];
            input.value = normalizeText(
              s.controls?.get(field.name),
              input.value,
            );
          });
        }
        input.addEventListener("input", () => {
          const s = session!;
          const index = Number(input.dataset.control);
          const field = s.fields[index];
          s.active = index;
          const row = input.closest("[data-form-row]");
          const value = normalizeText(
            s.controls?.get(field.name),
            controlValue(input),
          );
          if (
            value === (field.value ?? "") &&
            !input.hasAttribute("aria-invalid") &&
            !input.validity.badInput
          )
            return;
          row?.classList.remove("verified-background");
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
            const tools = root.querySelector(
              `[data-form-field-tools="${index}"]`,
            );
            if (tools) tools.innerHTML = formFieldActions(s, index);
            updatePreview(s);
            const label = document.getElementById(`form-state-${index}`)!;
            label.textContent = tr(
              error instanceof Error ? error.message : "invalidControlValue",
            );
            input.setAttribute("aria-invalid", "true");
            return;
          }
          const tools = root.querySelector(
            `[data-form-field-tools="${index}"]`,
          );
          if (tools) tools.innerHTML = formFieldActions(s, index);
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
              s.unifiedForm ? formFieldState(s, index) : field.status,
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
  click("pause-task", () => navigate("recent"));
  on("task-tools", "toggle", (event) => {
    if ((event.target as HTMLElement).isConnected)
      taskToolsOpen = (event.target as HTMLDetailsElement).open;
  });
  bindScannerExtras();
  on("custom-verify-default", "change", (event) => {
    const s = session!;
    s.template.verificationEnabled = (
      event.currentTarget as HTMLInputElement
    ).checked;
    refreshFormAttention(s);
    root
      .querySelectorAll<HTMLElement>("[data-form-field-tools]")
      .forEach((tools) => {
        const index = Number(tools.dataset.formFieldTools);
        const field = s.fields[index];
        tools.innerHTML = formFieldActions(s, index);
        document.getElementById(`form-state-${index}`)!.textContent = t(
          formFieldState(s, index),
        );
      });
  });
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
    if (session!.unifiedForm) focusFormField(session!.active);
    else focus(`field-${session!.active}`);
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
  click("session-back", () => navigate("recent"));
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
          // run() keeps the app inert until the handler finishes.
          focus(`field-${session!.active}`);
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
async function perform(action: Action, global = false, allOutputs = false) {
  const s = session;
  if (!s || s.mode === "complete") return;
  // Global navigation is frozen while an editor/settings screen or confirmation is open.
  if (view !== "session" || paused || (global && templateFormActive())) return;
  if (isSnippetCollection(s)) {
    if (action === "cancel") await closeSession();
    return;
  }
  if (s.mode === "review" || (appending.has(s) && action !== "cancel")) return;
  if (s.mode === "delivery" && s.prepared && action !== "cancel") {
    if (!s.prepared.length) return;
    const parts = deliveredSections(s),
      index = s.deliveryIndex ?? 0;
    if (action === "previous") {
      s.deliveryIndex = s.deliveryDone ? index : Math.max(0, index - 1);
      s.deliveryDone = false;
    } else if (action === "next") {
      s.deliveryIndex = Math.min(index + 1, parts.length - 1);
      s.deliveryDone = false;
    } else if (action === "finish" && global && !s.deliveryDone) {
      const sequence =
        !pasteOrder && deliveryMode === "sequence" && index < parts.length - 1;
      // Keep the whole sequence bound to its initial external destination.
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
          // Advance only after the native step returns. A failed step stays selected.
          transferred = true;
          noteStepTransfer(s, groupSections ? undefined : parts[current].id);
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
      if (sourceScannerChoice(s) && s.mode !== "ready")
        throw Error("scannerChooseOption");
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
      if (s.mode === "verify") {
        if (sourceScannerChoice(s)) throw Error("scannerChooseOption");
        await accept(await platform.capture(preserveClipboard), true);
      }
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
      if (s.unifiedForm && templateFormActive()) {
        const first = formAttention(s)[0];
        if (first) {
          await goToFormAttention(first.index);
          return;
        }
      }
      if (
        !s.unifiedForm &&
        (templateFormActive() ||
          (s.template.placeholderStyle === "source" && s.mode !== "verify")) &&
        verificationRequired(s)
      ) {
        if (beginVerification(s, s.template.placeholderStyle === "source")) {
          typingCheck = templateFormActive();
          message = "";
          render();
          focus(
            typingCheck ? controlFocus("typing-check") : focusSourceScanner(),
          );
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
        const step = currentFormStep(s);
        if (step?.outputs.length === 0) {
          if ((sessionSteps(s)?.length ?? 0) > (s.stepIndex ?? 0) + 1)
            await moveFormStep(1);
          else await requestSessionClose(s, true);
          return;
        }
        const parts = prepareSections(s);
        if (allOutputs) {
          for (const outputId of step?.outputs ?? []) {
            if (outputId === s.outputId) continue;
            const candidate = { ...s, outputId };
            const issue = formAttention(candidate)[0];
            if (issue) {
              await selectOutput(outputId);
              await goToFormAttention(issue.index);
              return;
            }
            prepareSections(candidate);
          }
          for (const outputId of step?.outputs ?? [])
            noteStepPrepared(s, outputId);
        }
        const shortcutError = await configureSessionShortcuts(true);
        await platform.compact(true, library.preferences.alwaysOnTop);
        s.prepared = parts;
        noteStepPrepared(s);
        s.mode = "delivery";
        s.deliveryIndex = 0;
        s.deliveryDone = false;
        message = "";
        render();
        focus("copy-section");
        await rememberOutput(s, sectionText(parts));
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
function saveSectionText(s: Session, parts: NonNullable<Session["prepared"]>) {
  const name =
    parseSource(s.template.content).filename === undefined
      ? "veraflow-output.txt"
      : sourceFilename(s, "txt");
  return platform.exportTemplates(sectionText(parts), name);
}
async function requestSessionClose(s: Session, confirmDiscard: boolean) {
  if (s.template.placeholderStyle === "source") {
    if (!(await saveActiveDraft(s))) return;
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
        `<div class="close-save-actions"><button value="text" class="primary">${esc(t("saveSections"))}</button></div>
        <div class="close-exit-actions"><button value="no" class="quiet" autofocus>${esc(t("keep"))}</button><button value="discard" class="quiet danger">${esc(t("closeWithoutSaving"))}</button></div>`,
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
// Text export requires valid, complete output. A prefilled file can preserve unfinished inputs.
function saveActiveDraft(s: Session) {
  if (isSnippetCollection(s)) return true;
  if (!csvSessions.has(s)) return saveBeforeClose(s);
  const draft = csvDrafts.get(s);
  return draft
    ? saveBeforeClose(
        { ...s, ...draft, prepared: undefined },
        templateDocuments.get(s),
      )
    : true;
}

function prefilledContent(s: Session) {
  return prefillSource(
    s.template.content,
    recordValues(s),
    s.unifiedForm || s.typing ? "form" : "scanner",
    s.template.name.slice(0, 250).trim(),
    new Map(
      s.fields.flatMap((field) =>
        field.status === "verified" && field.value?.trim()
          ? [[field.name, field.checkedByTyping ? "form" : "scanner"] as const]
          : [],
      ),
    ),
    s.unifiedForm && parseSource(s.template.content).workflow === "scanner"
      ? s.template.verificationEnabled
      : undefined,
  );
}

async function saveBeforeClose(
  s: Session,
  sourceDocument = templateDocuments.get(s),
) {
  const hasResponses = s.fields.some(
    (field) => field.value !== null || field.status === "skipped",
  );
  let parts: Session["prepared"];
  try {
    if (
      !root.querySelector(
        '.template-form [data-form-row]:not([hidden]) [aria-invalid="true"]',
      )
    )
      parts = exportSections(s);
    if (parts?.length === 0) parts = undefined;
  } catch {
    // Unfinished responses can still be saved as an editable template.
  }
  const choice = await actionDialog(
    "closeSourceTitle",
    `<p>${esc(t(parts ? "closeSourceHelp" : "closeSourceIncomplete"))}</p>`,
    `<div class="close-save-actions">
       ${hasResponses ? `<button value="recent" class="primary">${esc(t("saveRecentSession"))}</button>` : ""}
       ${parts ? `<button value="text" class="${hasResponses ? "" : "primary"}">${esc(t("saveSections"))}</button>` : ""}
       <button value="prefilled" class="${parts || hasResponses ? "" : "primary"}">${esc(t("savePrefilled"))}</button>
     </div>
     <div class="close-exit-actions">${s.prepared ? `<button value="edit" class="quiet">${esc(t(s.typing ? "returnToFilledForm" : "returnToFilledScanner"))}</button>` : ""}<button value="no" class="quiet" autofocus>${esc(t("keep"))}</button><button value="discard" class="quiet danger">${esc(t("closeWithoutSaving"))}</button></div>`,
  );
  if (choice === "discard") return true;
  if (choice === "edit") await editSourceResponses(s);
  if (choice === "text" && parts) {
    const saved = await saveSectionText(s, parts);
    if (saved) await rememberOutput(s, sectionText(s.prepared ?? parts));
    return saved;
  }
  if (choice === "prefilled")
    return platform.exportTemplates(
      prefilledContent(s),
      sourceFilename(s, "veraflow"),
    );
  if (choice === "recent") {
    await platform.rememberDocument(
      {
        id: sourceDocument?.sessionId ?? crypto.randomUUID(),
        title: s.template.name,
        content: prefilledContent(s),
        outputId: s.outputId,
        stepIndex: s.stepIndex,
      },
      sourceDocument?.recentToken,
    );
    recentDocuments = await platform.recentDocuments();
    await refreshTrayMenu().catch(() => {});
    return true;
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
    if (session) {
      if (appendStates.has(session)) await platform.releaseAppendCSV();
      eraseSession(session);
    }
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
  } else await navigate(wasScanner || wasSource ? "recent" : "templates");
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
async function actionDialog(
  title: Key,
  body: string,
  actions: string,
  setup?: (dialog: HTMLDialogElement) => void,
) {
  await platform.reveal();
  const prior = document.activeElement as HTMLElement | null;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "confirmation-title");
  if (title === "closeSourceTitle")
    dialog.classList.add("session-close-dialog");
  dialog.innerHTML = `<form method="dialog"><h2 id="confirmation-title">${esc(t(title))}</h2>${body}<div class="actions">${actions}</div></form>`;
  document.body.append(dialog);
  setup?.(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLTextAreaElement>("#snippet-copy-text")?.select();
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
function templateFieldClipboard(s: Session, index: number) {
  const field = s.fields[index];
  if (field?.value == null) throw Error("noValue");
  if (verificationRequired(s) && field.status !== "verified")
    throw Error("unverified");
  return field.value;
}
function fieldToCopy(target: HTMLElement) {
  if (
    view !== "session" ||
    !session ||
    paused ||
    typingCheck ||
    busy ||
    document.querySelector("dialog[open]") ||
    !["capture", "verify", "ready"].includes(session.mode) ||
    window.getSelection()?.toString()
  )
    return;
  if (
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement) &&
    target.selectionStart !== target.selectionEnd
  )
    return;
  const button = target.closest<HTMLElement>("button[data-field]");
  if (button) return Number(button.dataset.field);
  const row = target.closest<HTMLElement>(".template-form [data-form-row]");
  if (row) {
    const index = Number(row.dataset.formRow);
    if (
      !target.matches('[aria-invalid="true"]') &&
      session.fields[index]?.value !== null
    )
      return index;
  }
}

function copyFieldValue(s: Session, index: number) {
  if (s.unifiedForm) {
    const field = s.fields[index];
    if (!field?.value?.trim()) throw Error("noValue");
    if (fieldRequiresVerification(s, field) && field.status !== "verified")
      throw Error("unverified");
    return field.value;
  }
  return s.scanner
    ? scannerValue({ ...s, active: index })
    : templateFieldClipboard(s, index);
}
function showFieldCopied(s: Session, index: number) {
  lastStep = { key: "stepCopied", name: s.fields[index].name };
  message = t("copied");
  failure = false;
  const notice = document.getElementById("notice")!;
  notice.hidden = false;
  notice.className = "notice success";
  notice.setAttribute("role", "status");
  notice.textContent = message;
}

async function copySelectedField(s: Session, index: number) {
  await platform.copy(copyFieldValue(s, index));
  showFieldCopied(s, index);
}

// A native Edit > Copy command may reach the webview as a copy event.
window.addEventListener("copy", (event) => {
  if (!event.clipboardData) return;
  const target =
    event.target instanceof HTMLElement && event.target !== document.body
      ? event.target
      : document.activeElement;
  if (!(target instanceof HTMLElement)) return;
  const index = fieldToCopy(target);
  if (index === undefined) return;
  event.preventDefault();
  try {
    const s = session!;
    event.clipboardData.setData("text/plain", copyFieldValue(s, index));
    showFieldCopied(s, index);
  } catch (error) {
    report(error);
  }
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
    session?.unifiedForm &&
    view === "session" &&
    (templateFormActive() || appending.has(session)) &&
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === "KeyN" &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    void run(() =>
      goToFormAttention(
        nextFormAttention(session!.active, appending.has(session!)),
      ),
    );
  }
});
window.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.isComposing ||
    busy ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "c" &&
    event.target instanceof HTMLElement
  ) {
    const index = fieldToCopy(event.target);
    if (index !== undefined) {
      event.preventDefault();
      void run(() => copySelectedField(session!, index));
      return;
    }
  }
  if (view === "session" && templateFormActive()) return;
  if (
    view === "session" &&
    (session?.scanner || session?.template.placeholderStyle === "source")
  ) {
    const target = event.target as HTMLElement;
    const fieldButton = target.closest<HTMLButtonElement>("[data-field]");
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
          const hasParkedWork = [...parkedSessions.values()].some(
            ({ session }) => session.mode !== "complete",
          );
          if (
            hasParkedWork &&
            !(await confirmAction("quitParkedConfirm", "", t("quit")))
          )
            return;
          if (
            session?.template.placeholderStyle === "source" &&
            session.mode !== "complete"
          ) {
            if (dirty && !(await confirmAction("discardConfirm"))) return;
            if (!(await saveActiveDraft(session))) return;
          } else if (
            ((!hasParkedWork && privateWork()) || dirty) &&
            !(await confirmAction(session ? "quitConfirm" : "discardConfirm"))
          )
            return;
          if (session) eraseSession(session);
          for (const entry of parkedSessions.values()) {
            eraseSession(entry.session);
            if (entry.retained) eraseSession(entry.retained);
          }
          parkedSessions.clear();
          manualDrafts.clear();
          taskGeneration++;
          eraseRetainedScanner();
          await bindShortcuts(null, dispatch);
          await platform.active(false);
          quitting = true;
          await platform.quit();
        } else if (action === "update") await updateApp();
        else if (action === "open") await pickDocument();
        else if (action === "folder") await pickTemplateFolder();
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
