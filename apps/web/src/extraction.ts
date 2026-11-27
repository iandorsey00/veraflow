import {
  candidateFields,
  candidateFile,
  candidateFileLimit,
  extractCandidates,
  extractionFields,
  importCandidateFile,
  sourceTextLimit,
  validSourceText,
  type Candidate,
} from "../vendor/veraflow/core/candidates";
import { type Session } from "../vendor/veraflow/core/model";
import { planRecordValues } from "../vendor/veraflow/core/source-record";
import { button, download, element } from "./dom";
import { setText, text } from "./locale";
import { type Message } from "./strings";

type Candidates = ReadonlyMap<string, Candidate>;
type Changes = ReturnType<typeof planRecordValues>;

function showError(output: HTMLElement, reason: unknown) {
  const message = reason instanceof Error ? reason.message : "";
  const separator = message.indexOf(":");
  const key = separator < 0 ? message : message.slice(0, separator);
  const name = separator < 0 ? undefined : message.slice(separator + 1);
  switch (key) {
    case "recordUnknownField":
      return setText(output, "candidateUnknownField", name);
    case "recordInvalidField":
      return setText(output, "candidateInvalidField", name);
    case "batchSourceLimit":
    case "candidateLimit":
    case "candidateEvidenceMismatch":
    case "invalidCandidateFile":
    case "sourceTextFileType":
    case "extractClipboardDenied":
    case "selectCandidates":
      return setText(output, key);
    default:
      return setText(output, "extractReadError");
  }
}

async function readUtf8(file: File, maxBytes: number) {
  if (file.size > maxBytes) throw Error("candidateLimit");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await file.arrayBuffer(),
  );
}

function saveJson(filename: string, value: unknown) {
  const json = JSON.stringify(value, null, 2) + "\n";
  if (new TextEncoder().encode(json).length > candidateFileLimit)
    throw Error("candidateLimit");
  download(filename, json, "application/json");
}

export function setupExtraction(
  session: Session,
  apply: (changes: Changes, names: Iterable<string>) => void,
) {
  const fields = candidateFields(session);
  const trigger = document.querySelector<HTMLButtonElement>("#extract-source")!;
  const sourceDialog =
    document.querySelector<HTMLDialogElement>("#source-extraction")!;
  const source = document.querySelector<HTMLTextAreaElement>("#extract-text")!;
  const sourceError = document.getElementById("extract-error")!;
  const fileTools =
    document.querySelector<HTMLDetailsElement>("#candidate-file-tools")!;
  const openFile = document.querySelector<HTMLButtonElement>("#extract-open")!;
  const clipboard =
    document.querySelector<HTMLButtonElement>("#extract-clipboard")!;
  const importFile =
    document.querySelector<HTMLButtonElement>("#extract-import")!;
  const find = document.querySelector<HTMLButtonElement>("#extract-find")!;
  const textFile = document.querySelector<HTMLInputElement>("#extract-file")!;
  const candidateInput =
    document.querySelector<HTMLInputElement>("#candidate-file")!;
  const review =
    document.querySelector<HTMLDialogElement>("#candidate-review")!;
  const reviewResults = document.getElementById("candidate-results")!;
  const reviewError = document.getElementById("candidate-review-error")!;
  const applyButton =
    document.querySelector<HTMLButtonElement>("#apply-candidates")!;
  let candidates: Candidates = new Map();
  let reviewRows: ReturnType<typeof candidateRow>[] = [];
  let reading = false;
  let generation = 0;
  let opener = trigger;

  trigger.hidden = !fields.length;
  trigger.disabled = false;
  const externalTools = button("", () => openSource(externalTools, true));
  setText(externalTools, "candidateFileTools");
  if (fields.length)
    document.getElementById("form-tool-actions")!.append(externalTools);
  trigger.addEventListener("click", () => openSource(trigger, false));

  function openSource(control: HTMLButtonElement, showFileTools: boolean) {
    opener = control;
    source.value = "";
    fileTools.open = showFileTools;
    setText(sourceError);
    generation++;
    setReading(false);
    sourceDialog.showModal();
    source.focus();
  }
  document
    .getElementById("extract-cancel")!
    .addEventListener("click", () => sourceDialog.close());
  document
    .getElementById("candidate-cancel")!
    .addEventListener("click", () => review.close());
  sourceDialog.addEventListener("close", () => {
    if (!sourceDialog.open) source.value = "";
  });
  review.addEventListener("close", () => {
    reviewResults.replaceChildren();
    candidates = new Map();
    reviewRows = [];
    opener.focus();
  });

  function setReading(value: boolean) {
    reading = value;
    for (const control of [clipboard, openFile, importFile, find])
      control.disabled = value;
  }

  async function read<T>(load: () => Promise<T>, receive: (value: T) => void) {
    if (reading) return;
    const current = generation;
    setReading(true);
    setText(sourceError);
    try {
      const value = await load();
      if (sourceDialog.open && current === generation) receive(value);
    } catch (reason) {
      if (sourceDialog.open && current === generation)
        showError(sourceError, reason);
    } finally {
      if (current === generation) setReading(false);
    }
  }

  function setSource(value: string) {
    if (!validSourceText(value)) throw Error("batchSourceLimit");
    source.value = value;
    source.focus();
  }

  function readTextFile(file: File) {
    if (!/\.txt$/i.test(file.name)) {
      showError(sourceError, Error("sourceTextFileType"));
      return;
    }
    void read(() => readUtf8(file, sourceTextLimit * 4), setSource);
  }

  clipboard.addEventListener("click", () => {
    void read(async () => {
      try {
        if (!navigator.clipboard?.readText) throw Error();
        return await navigator.clipboard.readText();
      } catch {
        throw Error("extractClipboardDenied");
      }
    }, setSource);
  });
  openFile.addEventListener("click", () => textFile.click());
  importFile.addEventListener("click", () => candidateInput.click());
  textFile.addEventListener("change", () => {
    const file = textFile.files?.[0];
    textFile.value = "";
    if (file) readTextFile(file);
  });
  candidateInput.addEventListener("change", () => {
    const file = candidateInput.files?.[0];
    candidateInput.value = "";
    if (!file) return;
    const original = source.value;
    void read(
      () => readUtf8(file, candidateFileLimit),
      (json) =>
        showReview(
          importCandidateFile(
            fields,
            json,
            original.trim() ? original : undefined,
          ),
        ),
    );
  });
  sourceDialog.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  sourceDialog.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    if (reading) return;
    const files = event.dataTransfer.files;
    if (files.length === 1) readTextFile(files[0]);
    else showError(sourceError, Error("sourceTextFileType"));
  });
  document.getElementById("extract-fields")!.addEventListener("click", () => {
    setText(sourceError);
    try {
      saveJson("veraflow-extraction-fields.json", extractionFields(session));
    } catch (reason) {
      showError(sourceError, reason);
    }
  });
  document
    .getElementById("source-extraction-form")!
    .addEventListener("submit", (event) => {
      event.preventDefault();
      if (reading) return;
      try {
        showReview(extractCandidates(fields, source.value));
      } catch (reason) {
        showError(sourceError, reason);
      }
    });

  function showReview(found: Candidates) {
    candidates = found;
    reviewRows = [];
    const missing = element("ul");
    const current = new Map(
      session.fields.map(({ name, value }) => [name, value]),
    );
    reviewResults.replaceChildren();
    const decisions: HTMLElement[] = [];
    const additions: HTMLElement[] = [];
    const matches: HTMLElement[] = [];
    for (const [index, field] of fields.entries()) {
      const candidate = found.get(field.name);
      if (!candidate || candidate.status === "not_found") {
        missing.append(element("li", field.label));
        continue;
      }
      const row = candidateRow(
        field,
        index,
        candidate,
        current.get(field.name)!,
      );
      reviewRows.push(row);
      const group =
        row.status === "candidateFound"
          ? additions
          : row.status === "candidateSame"
            ? matches
            : decisions;
      group.push(row.group);
    }
    if (!reviewRows.length) reviewResults.append(text("p", "noCandidates"));
    for (const [key, rows] of [
      ["candidateDecisions", decisions],
      ["candidateNewValues", additions],
    ] as const) {
      if (!rows.length) continue;
      const section = element("section");
      section.className = "candidate-group";
      const heading = text("h3", key, String(rows.length));
      heading.id = key;
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading, ...rows);
      reviewResults.append(section);
    }
    if (matches.length) {
      const details = element("details");
      details.className = "candidate-group";
      details.append(
        text("summary", "candidateMatches", String(matches.length)),
        ...matches,
      );
      reviewResults.append(details);
    }
    if (missing.childElementCount) {
      const summary = element("details");
      summary.append(
        text("summary", "candidateMissing", String(missing.childElementCount)),
        missing,
      );
      reviewResults.append(summary);
    }
    applyButton.disabled = !reviewRows.length;
    setText(reviewError);
    sourceDialog.close();
    review.showModal();
    document.getElementById("candidate-review-title")!.focus();
  }

  document.getElementById("save-candidates")!.addEventListener("click", () => {
    setText(reviewError);
    try {
      saveJson("veraflow-candidates.json", candidateFile(candidates));
    } catch (reason) {
      showError(reviewError, reason);
    }
  });
  document
    .getElementById("candidate-review-form")!
    .addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const selected = new Map<string, string>();
        for (const row of reviewRows) {
          if (!row.checked.checked) continue;
          if (!row.proposed.value.trim() || row.proposed.value.length > 8192) {
            row.proposed.focus();
            throw Error("recordInvalidField:" + row.name);
          }
          selected.set(row.name, row.proposed.value);
        }
        if (!selected.size) throw Error("selectCandidates");
        const changes = planRecordValues(session, selected);
        apply(changes, selected.keys());
        review.close();
      } catch (reason) {
        showError(reviewError, reason);
      }
    });
}

function candidateRow(
  field: { name: string; label: string },
  index: number,
  candidate: Candidate,
  current: string | null,
) {
  const group = element("fieldset");
  group.className = "candidate-field";
  const proposed = element("textarea");
  proposed.id = `candidate-value-${index}`;
  proposed.rows = 2;
  const first = candidate.alternatives[0];
  proposed.value = candidate.status === "ambiguous" ? "" : first.value;
  const checked = element("input");
  checked.type = "checkbox";
  checked.checked =
    candidate.status === "found" &&
    candidate.alternatives.length === 1 &&
    current === null;
  let status: Message = "candidateFound";
  if (candidate.status === "ambiguous") status = "candidateAmbiguous";
  else if (candidate.status === "invalid") status = "candidateInvalid";
  else if (current !== null)
    status = current === first.value ? "candidateSame" : "candidateConflict";
  const state = text("p", status);
  state.className = "candidate-status";
  state.dataset.status = status;
  const currentValue = element("dl");
  currentValue.className = "details-list candidate-current";
  currentValue.append(
    text("dt", "candidateCurrent"),
    current === null
      ? text("dd", "emptyField")
      : current === ""
        ? text("dd", "emptyRecordValue")
        : element("dd", current),
  );
  group.append(element("legend", field.label), state, currentValue);
  if (candidate.status === "ambiguous") {
    const choices = element("select");
    choices.id = `candidate-choice-${index}`;
    const empty = new Option("", "");
    setText(empty, "choose");
    choices.add(empty);
    for (const [i, alternative] of candidate.alternatives.entries())
      choices.add(new Option(alternative.value, String(i)));
    choices.addEventListener("change", () => {
      checked.checked = false;
      proposed.value =
        choices.value === ""
          ? ""
          : candidate.alternatives[Number(choices.value)].value;
    });
    const label = text("label", "chooseCandidate");
    label.htmlFor = choices.id;
    group.append(label, choices);
  }
  if (status !== "candidateFound")
    proposed.addEventListener("input", () => {
      checked.checked = false;
    });
  const valueLabel = text("label", "candidateIncoming");
  valueLabel.htmlFor = proposed.id;
  const accept = element("label");
  accept.className = "checkbox";
  accept.append(checked, text("span", "acceptCandidate", field.label));
  const evidence = element("details");
  evidence.open =
    candidate.status !== "found" || status === "candidateConflict";
  evidence.append(text("summary", "candidateEvidence"));
  for (const alternative of candidate.alternatives) {
    const heading = element("p");
    heading.append(
      element("strong", alternative.value),
      " · ",
      text(
        "span",
        alternative.origin === "inferred"
          ? "candidateInferred"
          : "candidateDirect",
      ),
    );
    evidence.append(heading);
    if (!alternative.evidence.length)
      evidence.append(text("p", "candidateNoEvidence"));
    for (const { quote, line, source_id } of alternative.evidence) {
      const citation = element("blockquote");
      citation.append(element("p", quote));
      if (line || source_id) {
        const location = element("small");
        if (source_id) location.append(element("span", source_id));
        if (line && source_id) location.append(" · ");
        if (line) location.append(text("span", "candidateLine", String(line)));
        citation.append(location);
      }
      evidence.append(citation);
    }
  }
  group.append(valueLabel, proposed, accept, evidence);
  return { group, checked, proposed, status, name: field.name };
}
