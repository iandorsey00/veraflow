import { type Control } from "../vendor/veraflow/core/form";
import { type Template } from "../vendor/veraflow/core/model";
import {
  activeSourceFields,
  capture,
  clear,
  fieldRequiresVerification,
  formAttention,
  prepareSections,
  prepareWorkflow,
  startSession,
  verify,
} from "../vendor/veraflow/core/session";
import {
  parseSource,
  sourceOutput,
  sourceParts,
} from "../vendor/veraflow/core/source";
import { button, download, element } from "./dom";
import { coreVersion } from "./branding";
import { setLabel, setText, setupLanguage, text } from "./locale";
import { type Message } from "./strings";

const template: Template = JSON.parse(
  document.getElementById("definition")!.textContent!,
);
const source = parseSource(template.content);
const session = startSession(template);
session.unifiedForm = true;
prepareWorkflow(session, true);

const main = document.getElementById("form")!;
if (source.instructions) {
  const instructions = element("p", source.instructions);
  instructions.className = "instructions";
  main.querySelector("header")!.append(instructions);
}

const attention = element("section");
attention.setAttribute("aria-labelledby", "attention-title");
const attentionTitle = text("h2", "attention");
attention.className = "attention";
attentionTitle.id = "attention-title";
const attentionList = element("ul");
attention.append(attentionTitle, attentionList);
const attentionStatus = element("p");
attentionStatus.className = "sr-only";
attentionStatus.setAttribute("role", "status");

const required = element("div");
const optional = element("details");
const optionalFields = element("div");
optional.className = "optional-fields";
optional.append(text("summary", "optional"), optionalFields);
const toolbar = element("div");
toolbar.className = "actions output-actions";
const selector = element("select");
selector.id = "output-name";
for (const output of source.outputs)
  selector.add(new Option(output.label, output.id));
session.outputId = selector.value;
selector.addEventListener("change", () => {
  session.outputId = selector.value;
  invalidateOutput();
  refresh();
});

const result = element("section");
result.className = "result";
result.hidden = true;
const feedback = element("p");
feedback.setAttribute("role", "status");
const error = element("p");
error.setAttribute("role", "alert");
error.className = "error";
const rows = session.fields.map(createField);

const outputLabel = text("label", "output");
outputLabel.htmlFor = selector.id;
const outputChoice = element("div");
outputChoice.className = "output-choice";
outputChoice.append(outputLabel, selector);
const create = action("create", createOutput);
create.className = "primary";
toolbar.append(outputChoice, create);

const preview = element("details");
preview.className = "output-preview";
const previewContent = element("div");
preview.append(text("summary", "preview"), previewContent);
preview.addEventListener("toggle", refreshPreview);

const outputPanel = element("section");
outputPanel.className = "output-panel";
outputPanel.append(toolbar, preview, error, result, feedback);
main.append(attention, attentionStatus, required, optional, outputPanel);
const details = element("details");
details.className = "form-details";
const provenance: { sourceName?: string } = JSON.parse(
  document.getElementById("provenance")!.textContent!,
);
const properties = element("dl");
properties.className = "details-list";
if (provenance.sourceName)
  properties.append(
    text("dt", "originalFile"),
    element("dd", provenance.sourceName),
  );
properties.append(text("dt", "runtime"), element("dd", `v${coreVersion}`));
details.append(text("summary", "details"), properties);
document.getElementById("form-footer")!.prepend(details);
setupLanguage(
  document.getElementById("language")!,
  refresh,
  document.documentElement.lang === "zh-CN" ? "zh-CN" : "en",
);

function action(key: Message, handler: () => void) {
  const control = button("", handler);
  setText(control, key);
  return control;
}

function valueControl(control?: Control) {
  if (control?.options) {
    const select = element("select");
    const blank = new Option("", "");
    setText(blank, "choose");
    select.add(blank);
    for (const [id, text] of control.options) {
      select.add(new Option(control.optionLabels?.get(id) ?? text, id));
    }
    return select;
  }
  if (control?.multiline || !control) {
    const area = element("textarea");
    area.rows = control ? 3 : 2;
    return area;
  }
  // Keep raw input available to the shared validator instead of native input sanitization.
  const input = element("input");
  if (control.kind === "email") input.inputMode = "email";
  if (control.kind === "number") input.inputMode = "decimal";
  if (control.kind === "date") input.placeholder = "YYYY-MM-DD";
  return input;
}

function createField(field: (typeof session.fields)[number], index: number) {
  const control = session.controls!.get(field.name);
  const labelText = control?.label ?? field.name;
  const row = element("div");
  row.className = "field";
  const id = `field-${index}`;
  const label = element("label", labelText);
  label.htmlFor = id;
  const input = valueControl(control);
  input.id = id;
  input.autocomplete = "off";
  input.value = field.value ?? "";
  if (!control?.optional) input.setAttribute("aria-required", "true");
  const help = element("p", control?.instructions);
  help.className = "help instructions";
  help.id = `${id}-help`;
  help.hidden = !control?.instructions;
  const status = element("p");
  status.className = "status";
  status.id = `${id}-status`;
  status.setAttribute("role", "status");
  input.setAttribute(
    "aria-describedby",
    [!help.hidden && help.id, status.id].filter(Boolean).join(" "),
  );

  const checkArea = element("div");
  checkArea.className = "check";
  checkArea.id = `${id}-verification`;
  checkArea.hidden = true;
  const candidate = valueControl(control);
  candidate.id = `${id}-check`;
  candidate.autocomplete = "off";
  candidate.setAttribute("aria-describedby", status.id);
  const checkLabel = text("label", "independent", labelText);
  checkLabel.htmlFor = candidate.id;
  const verifyButton = action("verifyField", () => {
    const open = checkArea.hidden;
    verifyButton.setAttribute("aria-expanded", String(open));
    checkArea.hidden = !open;
    if (open) candidate.focus();
  });
  verifyButton.id = `${id}-verify-button`;
  verifyButton.setAttribute("aria-expanded", "false");
  verifyButton.setAttribute("aria-controls", checkArea.id);
  setLabel(verifyButton, "verifyFieldName", labelText);

  const state = {
    row,
    input,
    verifyButton,
    status,
    labelText,
    index,
    invalid: undefined as Message | undefined,
    checkError: undefined as Message | undefined,
  };
  function check() {
    if (!candidate.value.trim()) {
      state.checkError = "enterIndependent";
      refresh();
      candidate.focus();
      return;
    }
    session.active = index;
    session.mode = "verify";
    try {
      state.checkError = undefined;
      if (verify(session, candidate.value, false)) {
        candidate.value = "";
        checkArea.hidden = true;
        verifyButton.setAttribute("aria-expanded", "false");
        if (result.hidden) verifyButton.focus();
        else input.focus();
      } else {
        invalidateOutput();
        candidate.focus();
      }
    } catch {
      state.checkError = "invalidValue";
      candidate.focus();
    }
    refresh();
  }

  checkArea.append(checkLabel, candidate, action("compare", check));
  candidate.addEventListener("keydown", (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.key === "Enter" && !(candidate instanceof HTMLTextAreaElement)) {
      key.preventDefault();
      check();
    }
  });
  input.addEventListener("input", () => {
    session.active = index;
    clear(session);
    state.invalid = undefined;
    state.checkError = undefined;
    if (input.value.trim()) {
      try {
        capture(session, input.value, false);
      } catch {
        const kind = control?.kind;
        state.invalid =
          kind === "email"
            ? "invalidEmail"
            : kind === "number"
              ? "invalidNumber"
              : kind === "date"
                ? "invalidDate"
                : "invalidValue";
      }
    }
    candidate.value = "";
    checkArea.hidden = true;
    verifyButton.setAttribute("aria-expanded", "false");
    invalidateOutput();
    refresh();
  });
  row.addEventListener("focusout", () => queueMicrotask(refresh));
  row.append(label, input, help, status, verifyButton, checkArea);
  return state;
}

function invalidateOutput() {
  result.hidden = true;
  result.replaceChildren();
  preview.hidden = false;
  setText(error);
  setText(feedback);
}

function refresh() {
  const active = activeSourceFields(session);
  const issues = new Map(
    formAttention(session).map(({ index, check }) => [
      index,
      check ? "verify" : "enter",
    ]),
  );
  const values = new Map(
    session.fields.flatMap((field) =>
      field.value !== null || session.controls!.get(field.name)?.optional
        ? [[field.name, field.value ?? ""] as const]
        : [],
    ),
  );
  const selectedFields = new Set<string>();
  sourceParts(
    source,
    values,
    selectedFields,
    session.outputId,
    session.sourceContext,
  );
  for (const {
    row,
    input,
    verifyButton,
    status,
    index,
    invalid,
    checkError,
  } of rows) {
    const field = session.fields[index];
    const relevant = active?.has(field.name) ?? true;
    const isOptional = session.controls!.get(field.name)?.optional === true;
    const needsVerification = fieldRequiresVerification(session, field);
    row.hidden = !relevant;
    verifyButton.hidden = field.value === null || !needsVerification;
    const target =
      isOptional && !input.value.trim() ? optionalFields : required;
    if (
      !row.parentElement ||
      (row.parentElement !== target && !row.contains(document.activeElement))
    ) {
      const next = rows
        .slice(index + 1)
        .find((entry) => entry.row.parentElement === target);
      target.insertBefore(row, next?.row ?? null);
    }
    if (invalid && selectedFields.has(field.name)) issues.set(index, "fix");
    const message =
      invalid ||
      checkError ||
      (field.status === "mismatch"
        ? "mismatch"
        : field.status === "verified"
          ? "verified"
          : field.value !== null && needsVerification
            ? "verifyRequired"
            : undefined);
    setText(status, message);
    status.dataset.state = invalid || checkError ? "invalid" : field.status;
    if (invalid || issues.get(index) === "enter")
      input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
  optional.hidden = !rows.some(
    ({ row }) => row.parentElement === optionalFields && !row.hidden,
  );
  const links = [...issues].map(([index, kind]) => {
    const { row, input, verifyButton, labelText } = rows[index];
    const link = text(
      "a",
      kind === "verify" ? "verify" : kind === "fix" ? "fix" : "enter",
      labelText,
    );
    link.href = `#${kind === "verify" ? verifyButton.id : input.id}`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (row.parentElement === optionalFields) optional.open = true;
      if (kind === "verify") {
        if (verifyButton.getAttribute("aria-expanded") === "true")
          document.getElementById(`${input.id}-check`)?.focus();
        else verifyButton.click();
      } else input.focus();
    });
    const item = element("li");
    item.append(link);
    return item;
  });
  const previous = Array.from(
    attentionList.children,
    (item) => item.textContent,
  );
  if (
    links.length !== previous.length ||
    links.some((item, index) => item.textContent !== previous[index])
  )
    attentionList.replaceChildren(...links);
  attention.hidden = !links.length;
  setText(
    attentionStatus,
    links.length ? "remaining" : "ready",
    String(links.length),
  );
  refreshPreview();
}

function refreshPreview() {
  if (!preview.open || !result.hidden) return;
  setText(previewContent);
  if (!attention.hidden) {
    previewContent.append(text("p", "previewWaiting"));
    return;
  }
  try {
    for (const section of prepareSections(session)) {
      const group = element("div");
      const content = element("pre", section.text);
      group.append(element("h3", section.label), content);
      previewContent.append(group);
    }
  } catch (failure) {
    setText(previewContent, outputError(failure));
  }
}

function outputError(failure: unknown) {
  return failure instanceof Error && failure.message === "invalidText"
    ? "outputTooBig"
    : "outputError";
}

function createOutput() {
  invalidateOutput();
  if (!attention.hidden) {
    attentionList.querySelector("a")?.focus();
    return;
  }
  try {
    const output = sourceOutput(source, session.outputId);
    const sections = prepareSections(session);
    const full = sections
      .map(({ text }) => text)
      .join(output.delivery.separator);
    const title = element("h2", output.label);
    title.tabIndex = -1;
    const actions = element("div");
    actions.className = "actions";
    actions.append(
      action("copyFull", () => void copy(full, complete)),
      action("downloadText", () =>
        download(`${output.id}.txt`, full, "text/plain;charset=utf-8"),
      ),
    );
    const complete = textArea("", full);
    setLabel(complete.value, "entireOutput");
    complete.value.hidden = true;
    result.append(title, actions);
    for (const { label, text } of sections) {
      const section = textArea(label, text);
      const copyButton = action("copy", () => void copy(text, section));
      setLabel(copyButton, "copySection", label);
      const part = element("section");
      part.className = "result-part";
      const heading = element("div");
      heading.className = "result-part-heading";
      heading.append(section.label, copyButton);
      part.append(heading, section.value);
      result.append(part);
    }
    const entire = element("details");
    entire.addEventListener("toggle", () => {
      complete.value.hidden = !entire.open;
    });
    entire.append(text("summary", "showFull"), complete.value);
    result.append(entire);
    preview.open = false;
    preview.hidden = true;
    result.hidden = false;
    title.focus();
  } catch (failure) {
    setText(error, outputError(failure));
  }
}

function textArea(label: string, text: string) {
  const value = element("textarea");
  value.readOnly = true;
  value.value = text;
  value.rows = Math.max(2, Math.min(10, text.split("\n").length));
  value.setAttribute("aria-label", label);
  return { label: element("h3", label), value };
}

async function copy(text: string, area: ReturnType<typeof textArea>) {
  try {
    await navigator.clipboard.writeText(text);
    if (area.value.isConnected) setText(feedback, "copied");
  } catch {
    if (!area.value.isConnected) return;
    if (area.value.parentElement instanceof HTMLDetailsElement)
      area.value.parentElement.open = true;
    area.value.hidden = false;
    area.value.focus();
    area.value.select();
    setText(feedback, "blocked");
  }
}
