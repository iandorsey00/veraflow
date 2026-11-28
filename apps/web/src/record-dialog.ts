import { readRecordInput, recordInputLimit } from "../../../src/core/source-record";
import { ExportError } from "./definition";
import { button, element } from "./dom";
import { setText, text } from "./locale";
import { recordIssue, type RecordValues } from "./records";
import type { Message } from "./strings";

type ReviewRow = {
  name: string;
  incoming: string | null;
  current?: string | null;
  changed?: boolean;
};

type Review = {
  action: Message;
  rows?: ReviewRow[];
  apply?: () => void;
};

function recordValue(value: string | null | undefined) {
  if (value === undefined) return element("td");
  if (value === null) return text("td", "recordUnanswered");
  if (value === "") return text("td", "emptyRecordValue");
  const cell = element("td", value);
  cell.className = "record-value";
  return cell;
}

function reviewTable(rows: ReviewRow[]) {
  const table = element("table");
  table.className = "record-table";
  const heading = table.createTHead().insertRow();
  const merge = rows.some(({ current }) => current !== undefined);
  const columns: Message[] = merge
    ? ["recordField", "candidateCurrent", "recordIncoming"]
    : ["recordField", "recordValue"];
  for (const column of columns) {
    const label = text("th", column);
    label.scope = "col";
    heading.append(label);
  }
  const body = table.createTBody();
  for (const { name, incoming, current, changed } of rows) {
    const row = body.insertRow();
    const field = element("th", name);
    field.scope = "row";
    if (changed !== undefined)
      field.append(text("small", changed ? "recordChanged" : "recordUnchanged"));
    row.append(field);
    if (merge) row.append(recordValue(current));
    row.append(recordValue(incoming));
  }
  return table;
}

export function setupRecordDialog(
  trigger: HTMLButtonElement,
  prepare: (values: RecordValues, filename?: string) => Review,
  settings?: HTMLElement,
) {
  const dialog = element("dialog");
  dialog.className = "extraction-dialog";
  const title = text("h2", "openRecord");
  title.id = "record-dialog-title";
  title.tabIndex = -1;
  dialog.setAttribute("aria-labelledby", title.id);

  const acquire = element("section");
  const input = element("textarea");
  input.id = "record-input";
  input.rows = 7;
  input.autocomplete = "off";
  const label = text("label", "recordPaste");
  label.htmlFor = input.id;
  const fileInput = element("input");
  fileInput.type = "file";
  fileInput.accept = ".json,.json5";
  fileInput.hidden = true;
  const choose = button("", () => fileInput.click());
  setText(choose, "chooseRecord");
  const fileName = element("p");
  fileName.className = "help";
  fileName.setAttribute("role", "status");
  acquire.append(label, input, choose, fileInput, fileName);

  const review = element("section");
  review.hidden = true;
  const results = element("div");
  const guidance = text("p", "recordMergeHelp");
  guidance.className = "help";
  guidance.hidden = true;
  review.append(results, guidance);
  if (settings) review.append(settings);

  const issue = element("div");
  issue.className = "error";
  issue.setAttribute("role", "alert");
  const actions = element("div");
  actions.className = "actions dialog-actions";
  const cancel = button("", () => dialog.close());
  setText(cancel, "cancel");
  const back = button("", () => showInput());
  back.hidden = true;
  setText(back, "recordBack");
  const primary = text("button", "reviewRecord");
  primary.type = "submit";
  primary.className = "primary";
  actions.append(cancel, back, primary);
  const form = element("form");
  form.append(title, acquire, review, issue, actions);
  dialog.append(form);
  document.body.append(dialog);

  let selection = 0;
  let filename: string | undefined;
  let fileText: string | undefined;
  let values: RecordValues | undefined;
  let apply: Review["apply"];

  function showIssue(failure: unknown) {
    const { key, argument, detail } =
      failure instanceof ExportError ? failure : recordIssue(failure);
    issue.replaceChildren(text("p", key, argument));
    if (detail) {
      const explanation = element("p", detail);
      explanation.lang = "en";
      issue.append(explanation);
    }
  }

  function showInput() {
    review.hidden = back.hidden = true;
    acquire.hidden = false;
    issue.replaceChildren();
    setText(title, "openRecord");
    setText(primary, "reviewRecord");
    primary.disabled = false;
    input.focus();
  }

  function refreshReview() {
    if (review.hidden || !values) return;
    issue.replaceChildren();
    const inputRows = [...values].map(([name, incoming]) => ({ name, incoming }));
    let prepared: Review | undefined;
    try {
      prepared = prepare(values, filename);
    } catch (failure) {
      showIssue(failure);
    }
    const rows = prepared?.rows ?? inputRows;
    results.replaceChildren(reviewTable(rows));
    guidance.hidden = !prepared?.rows;
    apply = prepared?.apply;
    setText(primary, prepared?.action ?? (settings ? "openFilled" : "recordApply"));
    primary.disabled = !apply;
  }

  input.addEventListener("input", () => {
    ++selection;
    filename = fileText = undefined;
    setText(fileName);
    issue.replaceChildren();
    primary.disabled = false;
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = "";
    const current = ++selection;
    issue.replaceChildren();
    filename = fileText = undefined;
    input.value = "";
    setText(fileName);
    primary.disabled = true;
    try {
      if (!/\.json5?$/i.test(file.name)) throw Error("recordFileType");
      if (file.size > recordInputLimit) throw Error("recordInputLimit");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (current !== selection) return;
      filename = file.name;
      fileText = content;
      input.value = content;
      fileName.textContent = filename;
    } catch (failure) {
      if (current === selection)
        showIssue(failure instanceof TypeError ? Error("recordReadError") : failure);
    } finally {
      if (current === selection) primary.disabled = false;
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (primary.disabled) return;
    try {
      if (review.hidden) {
        values = readRecordInput(fileText ?? input.value);
        acquire.hidden = true;
        review.hidden = back.hidden = false;
        setText(title, "reviewRecordTitle");
        refreshReview();
        title.focus();
      } else {
        apply?.();
        dialog.close();
      }
    } catch (failure) {
      showIssue(failure);
    }
  });
  dialog.addEventListener("close", () => {
    ++selection;
    filename = fileText = undefined;
    values = apply = undefined;
    input.value = "";
    setText(fileName);
    results.replaceChildren();
    issue.replaceChildren();
  });
  trigger.addEventListener("click", () => {
    dialog.showModal();
    showInput();
  });
  return { dialog, refreshReview };
}
