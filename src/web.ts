import { version } from "./branding";
import { createDefinition, ExportError, sourceName } from "./definition";
import { download } from "./dom";
import { exportHtml } from "./export";
import { timestampedFilename } from "./filenames";
import { getLanguage, setText, setupLanguage } from "./locale";
import { type Language } from "./strings";
import { compareVersions, isReleaseVersion } from "./versions";

const input = document.querySelector<HTMLInputElement>("#source")!;
const choose = document.querySelector<HTMLButtonElement>("#choose")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
const includeSource =
  document.querySelector<HTMLInputElement>("#include-source")!;
const timestampFilename = document.querySelector<HTMLInputElement>(
  "#timestamp-filename",
)!;
const includeResponses =
  document.querySelector<HTMLInputElement>("#include-responses")!;
const prefillRecord =
  document.querySelector<HTMLInputElement>("#prefill-record")!;
const prefillOptions = document.getElementById("prefill-options")!;
const selectedFile = document.getElementById("selected-file")!;
const exportOptions = document.getElementById("export-options")!;
const exportFilename = document.getElementById("export-filename")!;
const message = document.getElementById("message")!;
const error = document.getElementById("error-summary")!;
const detail = document.getElementById("error-detail")!;
const update = document.querySelector<HTMLAnchorElement>("#update")!;

const languageKey = "veraflow-web-language";
let savedLanguage: Language | undefined;
try {
  const saved = localStorage.getItem(languageKey);
  if (saved === "en" || saved === "zh-CN") savedLanguage = saved;
} catch {
  // Preferences are optional when storage is unavailable.
}
setupLanguage(
  document.getElementById("language")!,
  (value) => {
    try {
      localStorage.setItem(languageKey, value);
    } catch {
      /* private mode */
    }
  },
  savedLanguage,
);

let prepared: { file: File; name: string; content: string } | undefined;
let selection = 0;
let recordSelection = 0;
let responseJson: string | undefined;
let recordError: ExportError | undefined;
let readingRecord = false;

function updateExportButton() {
  exportButton.disabled =
    !prepared || (includeResponses.checked && readingRecord);
}

includeResponses.addEventListener("change", () => {
  prefillOptions.hidden = !includeResponses.checked;
  setText(error);
  detail.textContent = "";
  updateExportButton();
});
prefillRecord.addEventListener("change", async () => {
  const current = ++recordSelection;
  responseJson = undefined;
  recordError = undefined;
  setText(error);
  detail.textContent = "";
  const file = prefillRecord.files?.[0];
  readingRecord = Boolean(file);
  updateExportButton();
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw new ExportError("tooBig");
    const content = await file.text();
    if (current === recordSelection) responseJson = content;
  } catch (failure) {
    if (current === recordSelection) {
      recordError =
        failure instanceof ExportError
          ? failure
          : new ExportError("recordReadError");
      if (includeResponses.checked) showError(recordError);
    }
  } finally {
    if (current === recordSelection) {
      readingRecord = false;
      updateExportButton();
    }
  }
});
choose.addEventListener("click", () => input.click());
input.addEventListener("change", async () => {
  const current = ++selection;
  prepared = undefined;
  exportButton.disabled = true;
  exportOptions.hidden = true;
  includeSource.checked = false;
  includeResponses.checked = false;
  prefillOptions.hidden = true;
  prefillRecord.value = "";
  ++recordSelection;
  responseJson = undefined;
  recordError = undefined;
  readingRecord = false;
  setText(message);
  setText(error);
  detail.textContent = "";
  const file = input.files?.[0];
  if (!file) {
    setText(choose, "chooseFile");
    setText(selectedFile, "chooseSource");
    return;
  }
  setText(choose, "replaceFile");
  setText(selectedFile);
  selectedFile.textContent = file.name;
  setText(message, "reading");
  try {
    const name = sourceName(file.name);
    if (file.size > 4 * 1024 * 1024) throw new ExportError("tooBig");
    const content = await file.text();
    if (current !== selection) return;
    createDefinition(content, file.name);
    prepared = { file, name, content };
    updateFilename();
    exportOptions.hidden = false;
    updateExportButton();
  } catch (failure) {
    if (current === selection) showError(failure);
  } finally {
    if (current === selection) setText(message);
  }
});
function updateFilename() {
  if (!prepared) return;
  const filename = `${prepared.name}.html`;
  exportFilename.textContent = timestampFilename.checked
    ? timestampedFilename(filename)
    : filename;
}

timestampFilename.addEventListener("change", updateFilename);
exportButton.addEventListener("click", () => {
  if (!prepared) return;
  const { file, content } = prepared;
  setText(error);
  detail.textContent = "";
  try {
    if (includeResponses.checked && recordError) throw recordError;
    const html = exportHtml(content, file.name, {
      includeResponses: includeResponses.checked,
      responseJson,
      language: getLanguage(),
      includeSourceName: includeSource.checked,
    });
    updateFilename();
    download(exportFilename.textContent!, html, "text/html;charset=utf-8");
    setText(message, "downloadRequested");
  } catch (failure) {
    setText(message);
    showError(failure);
  }
});

function showError(failure: unknown) {
  if (failure instanceof ExportError) {
    setText(error, failure.key, failure.argument);
    detail.textContent = failure.detail ?? "";
    detail.lang = "en";
  } else setText(error, "exportError");
}

let checking = false;
async function checkForUpdate() {
  if (checking || !/^https?:$/.test(location.protocol)) return;
  checking = true;
  try {
    const response = await fetch(new URL("./version.json", document.baseURI), {
      cache: "no-store",
    });
    if (!response.ok) return;
    const { version: latest } = await response.json();
    update.hidden =
      !isReleaseVersion(latest) || compareVersions(latest, version) <= 0;
    if (!update.hidden) {
      const refreshed = new URL(location.href);
      refreshed.searchParams.set("v", latest);
      update.href = refreshed.href;
    }
  } catch {
    // A temporarily inaccessible version file should not interrupt local export.
  } finally {
    checking = false;
  }
}

void checkForUpdate();
window.addEventListener("focus", () => void checkForUpdate());
window.addEventListener("online", () => void checkForUpdate());
window.setInterval(() => {
  if (!document.hidden) void checkForUpdate();
}, 60_000);
