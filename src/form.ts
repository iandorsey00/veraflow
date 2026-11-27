import { type Control } from "../vendor/veraflow/core/form";
import { type Template } from "../vendor/veraflow/core/model";
import {
  activateFormStep,
  activeSourceFields,
  applyRecordChanges,
  capture,
  clear,
  fieldRequiresVerification,
  formAttention,
  noteStepPrepared,
  noteStepTransfer,
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
import { setupExtraction } from "./extraction";
import { timestampedFilename } from "./filenames";
import { outputJson } from "./output-json";
import { setupRecordDialog } from "./record-dialog";
import { reviewRecordMerge } from "./records";
import { responseJson } from "./responses";
import { coreVersion } from "./branding";
import { setLabel, setText, setupLanguage, text } from "./locale";
import { type Message } from "./strings";

const {
  sourceLines,
  ...definition
}: Omit<Template, "content"> & { sourceLines: string[] } = JSON.parse(
  document.getElementById("definition")!.textContent!,
);
const template: Template = { ...definition, content: sourceLines.join("") };
const source = parseSource(template.content);
const steps = source.steps;
const stepOwners = new Map(
  steps?.flatMap((step, index) =>
    step.fields.map((name) => [name, index] as const),
  ),
);
type Prepared = ReturnType<typeof prepareSections>;
const latestPrepared = new Map<string, symbol>();
let stepIndex = 0;
const session = startSession(template);
const includedResponses = new Set(source.responses.keys());
session.stepOutputs ??= new Map();
session.unifiedForm = true;
prepareWorkflow(session, true);

const main = document.getElementById("form")!;
if (source.instructions) {
  const instructions = element("p", source.instructions);
  instructions.className = "instructions";
  main.querySelector("header")!.append(instructions);
}

const stepHeader = element("section");
stepHeader.className = "step-heading";
stepHeader.hidden = !steps;
const stepProgress = element("p");
stepProgress.className = "help";
const stepTitle = element("h2");
stepTitle.tabIndex = -1;
stepHeader.append(stepProgress, stepTitle);
const earlier = element("details");
earlier.className = "earlier-fields";
const earlierValues = element("dl");
earlierValues.className = "details-list";
earlier.append(text("summary", "earlierFields"), earlierValues);
const warnings = element("section");
warnings.className = "attention step-warnings";
warnings.setAttribute("role", "status");
warnings.setAttribute("aria-labelledby", "step-warnings-title");
const warningTitle = text("h2", "reviewSteps");
warningTitle.id = "step-warnings-title";
const warningList = element("ul");
warnings.append(warningTitle, warningList);

const attention = element("section");
attention.setAttribute("aria-labelledby", "attention-title");
const attentionTitle = text("h2", "attention");
attention.className = "attention field-attention";
attentionTitle.id = "attention-title";
const attentionList = element("ul");
const attentionStatus = element("div");
attentionStatus.className = "attention-counts";
attentionStatus.setAttribute("role", "status");
const missingCount = element("span");
const checkCount = element("span");
const invalidCount = element("span");
attentionStatus.append(missingCount, checkCount, invalidCount);
const jump = action("jumpToField", () =>
  attentionList.querySelector("a")?.click(),
);
attention.append(attentionTitle, attentionStatus, jump, attentionList);
const readyStatus = element("p");
readyStatus.className = "sr-only";
readyStatus.setAttribute("role", "status");
document.getElementById("field-checks")!.append(attention, readyStatus);

const required = element("div");
const optional = element("details");
const optionalFields = element("div");
optional.className = "optional-fields";
optional.append(text("summary", "optional"), optionalFields);
const toolbar = element("div");
toolbar.className = "actions output-actions";
const selector = element("select");
selector.id = "output-name";
if (!steps) session.outputId = sourceOutput(source).id;
selector.addEventListener("change", () => {
  session.outputId = selector.value;
  invalidateOutput();
  refreshOutputInfo();
  refresh();
});

const result = element("section");
result.className = "result";
result.hidden = true;
const timestampText = element("input");
timestampText.type = "checkbox";
const timestampOption = element("label");
timestampOption.className = "checkbox";
timestampOption.append(timestampText, text("span", "timestampFilename"));
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
const create = action("create", () => createOutput(false));
const createAll = action("prepareStepOutputs", () => createOutput(true));
create.className = "primary";
const currentOutputName = element("h2");
const outputInstructions = element("p");
outputInstructions.id = "output-instructions";
outputInstructions.className = "help instructions";
toolbar.append(outputChoice, create, createAll);

const preview = element("details");
preview.className = "output-preview";
const previewContent = element("div");
preview.append(text("summary", "preview"), previewContent);
preview.addEventListener("toggle", refreshPreview);

const outputPanel = document.getElementById("output-panel")!;
const previous = action("previousStep", () => openStep(stepIndex - 1));
const next = action("nextStep", () => {
  if (steps?.[stepIndex].outputs.length === 0 && !attention.hidden) {
    jump.focus();
    return;
  }
  openStep(stepIndex + 1);
});
const stepActions = element("nav");
stepActions.className = "actions step-actions";
setLabel(stepActions, "stepNavigation");
stepActions.append(previous, next);
outputPanel.append(
  currentOutputName,
  outputInstructions,
  toolbar,
  preview,
  error,
  result,
  feedback,
);
document.getElementById("step-context")!.append(stepHeader, warnings);
document.getElementById("record-fields")!.append(earlier, required, optional);
const formActions = document.getElementById("form-actions")!;
const formTools = document.querySelector<HTMLDetailsElement>("#form-tools")!;
const recordFeedback = document.getElementById("record-feedback")!;
document.getElementById("form-tool-actions")!.append(
  action("downloadResponses", downloadResponses),
);
formTools.hidden = false;
formActions.append(stepActions);
function applyReviewedValues(
  changes: Parameters<typeof applyRecordChanges>[1],
  names: Iterable<string>,
) {
  for (const name of names) includedResponses.add(name);
  if (changes.length) {
    applyRecordChanges(session, changes);
    for (const { index } of changes) rows[index].syncValue();
    invalidateOutput();
    refreshStep();
    refresh();
  }
}
setupExtraction(session, (changes, names) => {
  applyReviewedValues(changes, names);
  setText(
    recordFeedback,
    changes.length ? "candidateApplied" : "candidateNoChanges",
  );
});
setupRecordDialog(
  document.querySelector<HTMLButtonElement>("#import-record")!,
  (values) => {
    const { changes, rows } = reviewRecordMerge(session, values);
    return {
      action: "recordApply",
      rows,
      apply() {
        applyReviewedValues(changes, values.keys());
        setText(recordFeedback, changes.length ? "recordApplied" : "recordNoChanges");
      },
    };
  },
);
refreshOutputChoices();
refreshOutputInfo();
refreshStep();
const details = element("details");
details.className = "form-details";
const provenance: { sourceName?: string; openPreview?: boolean } = JSON.parse(
  document.getElementById("provenance")!.textContent!,
);
preview.open = provenance.openPreview ?? false;
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
  candidate.setAttribute(
    "aria-describedby",
    input.getAttribute("aria-describedby")!,
  );
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
    syncValue() {
      input.value = field.value ?? "";
      state.invalid = undefined;
      resetCheck();
    },
  };

  function resetCheck() {
    state.checkError = undefined;
    candidate.value = "";
    checkArea.hidden = true;
    verifyButton.setAttribute("aria-expanded", "false");
  }
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
    state.invalid = undefined;
    includedResponses.add(field.name);
    setText(recordFeedback);
    if (input.value.trim()) {
      try {
        if (input.value.includes("\0") || input.value.length > 1024 * 1024)
          throw Error("invalidControlValue");
        capture(session, input.value, false);
      } catch {
        clear(session);
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
    } else if (control?.optional) {
      applyRecordChanges(session, [{ index, value: "" }]);
    } else clear(session);
    resetCheck();
    invalidateOutput();
    refresh();
  });
  row.append(label, input, help, status, verifyButton, checkArea);
  return state;
}

function outputIds() {
  return steps?.[stepIndex].outputs ?? source.outputs.map(({ id }) => id);
}

function refreshOutputChoices() {
  const ids = outputIds();
  selector.replaceChildren(
    ...ids.map((id) => new Option(sourceOutput(source, id).label, id)),
  );
  selector.value = session.outputId ?? "";
  outputChoice.hidden = Boolean(steps) && ids.length < 2;
  createAll.hidden = !steps || ids.length < 2;
  outputPanel.hidden = ids.length === 0;
}

function refreshOutputInfo() {
  const output =
    session.outputId === undefined
      ? undefined
      : sourceOutput(source, session.outputId);
  currentOutputName.hidden = !steps || !output || !outputChoice.hidden;
  currentOutputName.textContent = output?.label ?? "";
  outputInstructions.hidden = !output?.instructions;
  outputInstructions.textContent = output?.instructions ?? "";
  if (output?.instructions)
    create.setAttribute("aria-describedby", outputInstructions.id);
  else create.removeAttribute("aria-describedby");
}

function refreshStep() {
  const step = steps?.[stepIndex];
  earlierValues.replaceChildren();
  earlier.open = false;
  if (steps && step) {
    setText(stepProgress, "stepProgress", `${stepIndex + 1} / ${steps.length}`);
    stepTitle.textContent = step.title;
    for (const { labelText, index } of rows) {
      const field = session.fields[index];
      if (
        stepOwners.get(field.name) === stepIndex ||
        !step.references.has(field.name)
      )
        continue;
      const value =
        field.value === null
          ? text("dd", "emptyField")
          : element("dd", field.value);
      if (field.status === "verified")
        value.append(" · ", text("small", "verified"));
      earlierValues.append(element("dt", labelText), value);
    }
  }
  earlier.hidden = !earlierValues.childElementCount;
  previous.hidden = !step || stepIndex === 0;
  refreshNext();
}

function refreshNext() {
  next.hidden =
    !steps ||
    stepIndex === steps.length - 1 ||
    (steps[stepIndex].outputs.length > 0 && !session.prepared);
  next.classList.toggle("primary", steps?.[stepIndex].outputs.length === 0);
  stepActions.hidden = previous.hidden && next.hidden;
}

function openStep(index: number, focusHeading = true) {
  const step = steps?.[index];
  if (!step) return;
  stepIndex = index;
  activateFormStep(session, index);
  refreshOutputChoices();
  invalidateOutput();
  refreshStep();
  refresh();
  if (focusHeading) stepTitle.focus();
}

function refreshWarnings() {
  const entries = source.outputs.flatMap((output) => {
    const progress = session.stepOutputs?.get(output.id);
    if (!progress?.needsReview && !progress?.staleSections.size) return [];
    const step = steps?.find(({ outputs }) => outputs.includes(output.id));
    return [
      text(
        "li",
        progress.staleSections.size ? "reviewCopied" : "reviewOutput",
        step?.outputs.length === 1 ? step.title : output.label,
      ),
    ];
  });
  if (
    entries.length !== warningList.childElementCount ||
    entries.some(
      (entry, i) => entry.textContent !== warningList.children[i].textContent,
    )
  ) {
    warningList.replaceChildren(...entries);
  }
  warnings.hidden = !entries.length;
}

function invalidateOutput() {
  delete session.prepared;
  refreshNext();
  result.hidden = true;
  result.replaceChildren();
  preview.hidden = false;
  refreshOutputInfo();
  setText(error);
  setText(feedback);
}

function outputIssues(outputId = session.outputId) {
  const candidate = { ...session, outputId };
  const issues = new Map<number, "enter" | "verify" | "fix">(
    formAttention(candidate).map(({ index, check }) => [
      index,
      check ? "verify" : "enter",
    ]),
  );
  const invalidRows = rows.filter(({ invalid }) => invalid);
  if (invalidRows.length) {
    const step = steps?.[stepIndex];
    const relevant = new Set(step?.alwaysVisible);
    if (outputId !== undefined || !step) {
      const values = new Map(
        session.fields.flatMap(({ name, value }) =>
          value !== null || session.controls!.get(name)?.optional
            ? [[name, value ?? ""] as const]
            : [],
        ),
      );
      sourceParts(source, values, relevant, outputId, session.sourceContext);
    }
    for (const { index } of invalidRows)
      if (relevant.has(session.fields[index].name)) issues.set(index, "fix");
  }
  return issues;
}

function refresh() {
  const active = activeSourceFields(session);
  const issues = outputIssues();
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
    const own = !steps || stepOwners.get(field.name) === stepIndex;
    row.hidden = !relevant || !own;
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
      const owner = stepOwners.get(session.fields[index].name);
      if (owner !== undefined && owner !== stepIndex) openStep(owner, false);
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
  const previousLinks = Array.from(
    attentionList.children,
    (item) => item.firstElementChild,
  );
  if (
    links.length !== previousLinks.length ||
    links.some(
      (item, index) =>
        item.textContent !== previousLinks[index]?.textContent ||
        item.firstElementChild?.getAttribute("href") !==
          previousLinks[index]?.getAttribute("href"),
    )
  )
    attentionList.replaceChildren(...links);
  attention.hidden = !links.length;
  const kinds = [...issues.values()];
  setText(
    missingCount,
    "missingValues",
    String(kinds.filter((kind) => kind === "enter").length),
  );
  setText(
    checkCount,
    "pendingChecks",
    String(kinds.filter((kind) => kind === "verify").length),
  );
  const invalid = kinds.filter((kind) => kind === "fix").length;
  invalidCount.hidden = invalid === 0;
  setText(invalidCount, "invalidValues", String(invalid));
  setText(readyStatus, links.length ? undefined : "ready");
  refreshWarnings();
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

function downloadResponses() {
  const invalid = rows.find((row) => row.invalid);
  if (invalid) {
    const owner = stepOwners.get(session.fields[invalid.index].name);
    if (owner !== undefined && owner !== stepIndex) openStep(owner, false);
    invalid.row.hidden = false;
    if (invalid.row.parentElement === optionalFields) {
      optional.hidden = false;
      optional.open = true;
    }
    setText(recordFeedback, "fixRecord");
    invalid.input.focus();
    return;
  }
  if (!includedResponses.size) {
    setText(recordFeedback, "recordNoResponses");
    return;
  }
  setText(recordFeedback);
  download(
    "responses.json",
    responseJson(session, includedResponses),
    "application/json",
  );
}

function createOutput(all: boolean) {
  invalidateOutput();
  const ids = all
    ? outputIds()
    : session.outputId === undefined
      ? []
      : [session.outputId];
  if (!ids.length) return;
  const blocked = ids.find((id) => outputIssues(id).size > 0);
  if (blocked !== undefined) {
    session.outputId = selector.value = blocked;
    refreshOutputInfo();
    refresh();
    jump.focus();
    return;
  }
  try {
    const prepared = ids.map((id) => ({
      output: sourceOutput(source, id),
      sections: prepareSections({ ...session, outputId: id }),
    }));
    const multiple = prepared.length > 1;
    const filename = multiple ? "outputs.json" : `${prepared[0].output.id}.json`;
    const downloadJson = action("downloadOutputJson", () => {
      const outputs = prepared.map(({ output: { id, label }, sections }) => ({
        id,
        label,
        sections,
      }));
      download(
        timestampText.checked ? timestampedFilename(filename) : filename,
        outputJson(outputs),
        "application/json",
      );
    });
    result.append(timestampOption);
    if (multiple) result.append(downloadJson);
    for (const { output, sections } of prepared)
      result.append(
        renderPrepared(
          output,
          sections,
          multiple,
          multiple ? undefined : downloadJson,
        ),
      );
    session.prepared = prepared[0].sections;
    preview.open = false;
    preview.hidden = true;
    result.hidden = false;
    currentOutputName.hidden = true;
    if (prepared.length > 1) outputInstructions.hidden = true;
    refreshWarnings();
    refreshNext();
    result.querySelector("h2")?.focus();
  } catch (failure) {
    invalidateOutput();
    setText(error, outputError(failure));
  }
}

function renderPrepared(
  output: ReturnType<typeof sourceOutput>,
  sections: Prepared,
  showInstructions: boolean,
  downloadJson?: HTMLButtonElement,
) {
  const group = element("section");
  group.className = "prepared-output";
  const full = sections.map(({ text }) => text).join(output.delivery.separator);
  const generation = Symbol();
  const transferred = (section?: string) =>
    trackTransfer(output.id, sections, generation, section);
  const title = element("h2", output.label);
  title.tabIndex = -1;
  title.id = `prepared-output-${output.id}`;
  group.setAttribute("aria-labelledby", title.id);
  group.append(title);
  if (output.instructions && showInstructions) {
    const guidance = element("p", output.instructions);
    guidance.className = "help instructions";
    guidance.id = `prepared-instructions-${output.id}`;
    title.setAttribute("aria-describedby", guidance.id);
    group.append(guidance);
  } else if (output.instructions) {
    title.setAttribute("aria-describedby", outputInstructions.id);
  }
  const actions = element("div");
  actions.className = "actions";
  const filename = `${output.id}.txt`;
  actions.append(
    action("copyFull", () => void copy(full, complete, () => transferred())),
    action("downloadText", () =>
      download(
        timestampText.checked ? timestampedFilename(filename) : filename,
        full,
        "text/plain;charset=utf-8",
      ),
    ),
  );
  if (downloadJson) actions.append(downloadJson);
  const complete = textArea("", full, () => transferred());
  setLabel(complete.value, "entireOutput");
  complete.value.hidden = true;
  group.append(actions);
  for (const { id, label, text } of sections) {
    const onCopy = () => transferred(id);
    const section = textArea(label, text, onCopy);
    const copyButton = action("copy", () => void copy(text, section, onCopy));
    setLabel(copyButton, "copySection", label);
    const part = element("section");
    part.className = "result-part";
    const heading = element("div");
    heading.className = "result-part-heading";
    heading.append(section.label, copyButton);
    part.append(heading, section.value);
    group.append(part);
  }
  const entire = element("details");
  entire.addEventListener("toggle", () => {
    complete.value.hidden = !entire.open;
  });
  entire.append(text("summary", "showFull"), complete.value);
  group.append(entire);
  latestPrepared.set(output.id, generation);
  noteStepPrepared(session, output.id);
  return group;
}

function trackTransfer(
  outputId: string,
  prepared: Prepared,
  generation: symbol,
  section?: string,
) {
  const progress = session.stepOutputs?.get(outputId);
  if (!progress) return;
  // Resolve an asynchronous clipboard write against the output that initiated it.
  const stale =
    progress.needsReview || latestPrepared.get(outputId) !== generation;
  noteStepTransfer({ ...session, outputId, prepared }, section);
  if (stale) {
    for (const part of prepared)
      if (section === undefined || section === part.id)
        progress.staleSections.add(part.id);
  }
  refreshWarnings();
}

function textArea(label: string, text: string, onCopy: () => void) {
  const value = element("textarea");
  value.readOnly = true;
  value.value = text;
  value.rows = Math.max(2, Math.min(10, text.split("\n").length));
  value.setAttribute("aria-label", label);
  value.addEventListener("copy", () => {
    if (
      value.value.length &&
      value.selectionStart === 0 &&
      value.selectionEnd === value.value.length
    )
      onCopy();
  });
  return { label: element("h3", label), value };
}

async function copy(
  text: string,
  area: ReturnType<typeof textArea>,
  onCopy: () => void,
) {
  try {
    await navigator.clipboard.writeText(text);
    onCopy();
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
