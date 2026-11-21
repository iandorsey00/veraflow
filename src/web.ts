import { version } from "./branding";
import { createDefinition, ExportError, sourceName } from "./definition";
import { download } from "./dom";
import { exportHtml } from "./export";
import { getLanguage, setText, setupLanguage } from "./locale";
import { type Language } from "./strings";

const input = document.querySelector<HTMLInputElement>("#source")!;
const choose = document.querySelector<HTMLButtonElement>("#choose")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
const includeSource =
  document.querySelector<HTMLInputElement>("#include-source")!;
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
choose.addEventListener("click", () => input.click());
input.addEventListener("change", async () => {
  const current = ++selection;
  prepared = undefined;
  exportButton.disabled = true;
  exportOptions.hidden = true;
  includeSource.checked = false;
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
    exportFilename.textContent = `${name}.html`;
    exportOptions.hidden = false;
    exportButton.disabled = false;
  } catch (failure) {
    if (current === selection) showError(failure);
  } finally {
    if (current === selection) setText(message);
  }
});
exportButton.addEventListener("click", () => {
  if (!prepared) return;
  const { file, name, content } = prepared;
  setText(error);
  detail.textContent = "";
  try {
    const html = exportHtml(content, file.name, {
      language: getLanguage(),
      includeSourceName: includeSource.checked,
    });
    download(`${name}.html`, html, "text/html;charset=utf-8");
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

function isNewer(candidate: unknown) {
  if (typeof candidate !== "string" || !/^\d+\.\d+\.\d+$/.test(candidate))
    return false;
  const current = version.split(".").map(Number);
  const offered = candidate.split(".").map(Number);
  const firstChange = offered.findIndex(
    (part, index) => part !== current[index],
  );
  return firstChange !== -1 && offered[firstChange] > current[firstChange];
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
    if (isNewer(latest)) {
      const refreshed = new URL(location.href);
      refreshed.searchParams.set("v", latest);
      update.href = refreshed.href;
      update.hidden = false;
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
