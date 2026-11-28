import { startSession } from "../../../src/core/session";
import { recordFormSource } from "../../../src/core/source-record";
import { createDefinition, ExportError, sourceName } from "./definition";
import { download, element } from "./dom";
import { exportHtml } from "./export";
import { getLanguage, setText, text } from "./locale";
import { setupRecordDialog } from "./record-dialog";
import { reviewRecordMerge } from "./records";
import { translate } from "./strings";

export function setupRecordAuthoring() {
  const trigger = document.querySelector<HTMLButtonElement>("#open-record")!;
  const preview = document.getElementById("record-preview")!;
  const heading = document.getElementById("record-preview-title")!;
  const frame = document.querySelector<HTMLIFrameElement>("#record-form")!;
  const downloadButton = document.querySelector<HTMLButtonElement>("#download-record-form")!;
  let generated: { html: string; filename: string } | undefined;

  downloadButton.addEventListener("click", () => {
    if (generated)
      download(generated.filename, generated.html, "text/html;charset=utf-8");
  });

  const settings = element("div");
  settings.className = "record-settings";
  const mode = element("select");
  mode.id = "record-output-mode";
  const modeLabel = text("label", "recordOutputMode");
  modeLabel.htmlFor = mode.id;
  const summary = text("option", "recordSummary");
  summary.value = "summary";
  const custom = text("option", "recordCustom");
  custom.value = "custom";
  const reusable = text("option", "recordReusable");
  reusable.value = "reusable";
  mode.append(summary, custom, reusable);

  const customSettings = element("div");
  customSettings.hidden = true;
  const output = element("textarea");
  output.id = "record-output";
  output.rows = 4;
  output.autocomplete = "off";
  output.setAttribute("aria-describedby", "record-output-help");
  const outputLabel = text("label", "recordOutputText");
  outputLabel.htmlFor = output.id;
  const outputHelp = text("p", "recordOutputHelp");
  outputHelp.id = "record-output-help";
  outputHelp.className = "help";
  customSettings.append(outputLabel, output, outputHelp);

  const reusableSettings = element("div");
  reusableSettings.hidden = true;
  const file = element("input");
  file.type = "file";
  file.accept = ".veraflow,.vf";
  file.id = "record-template";
  const fileLabel = text("label", "recordTemplate");
  fileLabel.htmlFor = file.id;
  const status = element("p");
  status.className = "status";
  status.setAttribute("role", "status");
  reusableSettings.append(fileLabel, file, status);
  settings.append(modeLabel, mode, customSettings, reusableSettings);

  let templateFile: { filename: string; content: string } | undefined;
  let templateError: unknown;
  let selection = 0;

  function openForm(html: string, filename: string) {
    generated = { html, filename };
    frame.srcdoc = html;
    preview.hidden = false;
    requestAnimationFrame(() => heading.focus());
  }

  const { dialog, refreshReview } = setupRecordDialog(
    trigger,
    (values, recordFilename) => {
      const language = getLanguage();
      const options = { language, includeResponses: true, openPreview: true };
      if (mode.value === "reusable") {
        if (templateError) throw templateError;
        if (!templateFile) return { action: "openFilled" };
        const { filename, content } = templateFile;
        const template = createDefinition(content, filename, options);
        const { rows } = reviewRecordMerge(startSession(template), values);
        return {
          rows,
          action: "openFilled",
          apply() {
            const html = exportHtml(content, filename, { ...options, responseValues: values });
            openForm(html, `${sourceName(filename)}.html`);
          },
        };
      }
      return {
        action: "openFilled",
        apply() {
          const filename = recordFilename?.replace(/\.json5?$/i, ".vf") ?? "json-record.vf";
          const source = recordFormSource(
            recordFilename ? sourceName(filename) : translate(language, "recordDefaultTitle"),
            values,
            mode.value === "custom" ? output.value : "",
          );
          openForm(exportHtml(source, filename, options), `${sourceName(filename)}.html`);
        },
      };
    },
    settings,
  );

  mode.addEventListener("change", () => {
    customSettings.hidden = mode.value !== "custom";
    reusableSettings.hidden = mode.value !== "reusable";
    refreshReview();
  });
  file.addEventListener("change", async () => {
    const current = ++selection;
    templateFile = undefined;
    templateError = undefined;
    const selected = file.files?.[0];
    setText(status, selected ? "reading" : undefined);
    refreshReview();
    if (!selected) return;
    try {
      sourceName(selected.name);
      if (selected.size > 4 * 1024 * 1024) throw new ExportError("tooBig");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await selected.arrayBuffer(),
      );
      if (current === selection) templateFile = { filename: selected.name, content };
    } catch (failure) {
      if (current === selection)
        templateError = failure instanceof ExportError ? failure : new ExportError("extractReadError");
    } finally {
      if (current === selection) {
        setText(status);
        refreshReview();
      }
    }
  });
  dialog.addEventListener("close", () => {
    ++selection;
    mode.value = "summary";
    output.value = file.value = "";
    templateFile = templateError = undefined;
    customSettings.hidden = reusableSettings.hidden = true;
    setText(status);
  });
}
