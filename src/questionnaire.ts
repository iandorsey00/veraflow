import {
  collectionAnswer,
  collectionResponseWriter,
  type CollectionRequest,
  type Question,
} from "./collection";
import { download, element } from "./dom";
import { setText, setupLanguage, text } from "./locale";

const request: CollectionRequest = JSON.parse(
  document.getElementById("collection-request")!.textContent!,
);
const form = document.querySelector<HTMLFormElement>("#questionnaire")!;
const questions = document.getElementById("questions")!;
const status = document.getElementById("response-status")!;
const writeResponse = collectionResponseWriter(request);
const controls = request.questions.map(createField);
questions.append(...controls.map(({ row }) => row));

setupLanguage(
  document.getElementById("language")!,
  () => {
    document.title = document.querySelector("h1")!.textContent!;
  },
  document.documentElement.lang === "zh-CN" ? "zh-CN" : "en",
);
form.querySelector("button")!.disabled = false;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const answers = new Map<string, string>();
  setText(status);
  for (const control of controls) {
    const { question, input, value, error } = control;
    const raw = value();
    try {
      collectionAnswer(question, raw);
      answers.set(question.id, raw);
      input.removeAttribute("aria-invalid");
      setText(error);
    } catch (failure) {
      input.setAttribute("aria-invalid", "true");
      setText(
        error,
        failure instanceof Error && failure.message === "collectionRequired"
          ? "collectionRequired"
          : "collectionInvalidAnswer",
      );
      input.focus();
      return;
    }
  }

  try {
    download(
      "collection-response.json",
      writeResponse(answers),
      "application/json",
    );
    setText(status, "collectionResponseReady");
  } catch {
    setText(status, "collectionResponseError");
  }
});

function createField(question: Question, index: number) {
  const id = `question-${index}`;
  const requirement = text(
    "span",
    question.required ? "collectionRequiredMark" : "collectionOptional",
  );
  requirement.className = "help";
  const instructions = element("p", question.instructions);
  instructions.id = `${id}-help`;
  instructions.className = "instructions";
  instructions.hidden = question.instructions === undefined;
  const error = element("p");
  error.id = `${id}-error`;
  error.className = "error";
  error.setAttribute("role", "alert");
  const description = [
    instructions.hidden ? undefined : instructions.id,
    error.id,
  ]
    .filter(Boolean)
    .join(" ");

  if (question.type === "boolean" || question.type === "radio") {
    const row = element("fieldset");
    row.className = "collection-field";
    const label = element("legend", question.label);
    label.append(" ", requirement);
    row.append(label, instructions);
    const options = element("div");
    options.className = "collection-choices";
    const choices = question.options!.map(({ id, label }) => ({
      id,
      label: element("span", label),
    }));
    if (!question.required)
      choices.unshift({ id: "", label: text("span", "collectionNoAnswer") });
    const inputs = choices.map((choice) => {
      const input = element("input");
      input.type = "radio";
      input.name = id;
      input.value = choice.id;
      input.required = question.required;
      input.checked = choice.id === "";
      input.setAttribute("aria-describedby", description);
      const label = element("label");
      label.append(input, choice.label);
      options.append(label);
      return input;
    });
    row.append(options, error);
    return {
      row,
      question,
      error,
      input: inputs[0],
      value: () => inputs.find(({ checked }) => checked)?.value ?? "",
    };
  }

  const row = element("div");
  row.className = "collection-field";
  const label = element("label", question.label);
  label.htmlFor = id;
  label.append(" ", requirement);
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (question.type === "dropdown") {
    input = element("select");
    const blank = text(
      "option",
      question.required ? "choose" : "collectionNoAnswer",
    );
    blank.value = "";
    input.append(
      blank,
      ...question.options!.map(({ id, label }) => new Option(label, id)),
    );
  } else if (question.multiline ?? question.type === "textarea") {
    input = element("textarea");
    input.rows = 4;
  } else {
    input = element("input");
    if (question.type === "email") input.inputMode = "email";
    if (question.type === "number") input.inputMode = "decimal";
    if (question.type === "date") input.placeholder = "YYYY-MM-DD";
  }
  input.id = id;
  input.required = question.required;
  input.setAttribute("aria-describedby", description);
  row.append(label, instructions, input, error);
  return { row, question, error, input, value: () => input.value };
}
