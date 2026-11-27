import {
  collectionLimit,
  readCollectionRequest,
  type CollectionRequest,
} from "./collection";
import { exportCollectionHtml } from "./collection-export";
import { download, element } from "./dom";
import { getLanguage, setText, text } from "./locale";

export function setupCollectionAuthoring() {
  const choose =
    document.querySelector<HTMLButtonElement>("#choose-collection")!;
  const input = document.querySelector<HTMLInputElement>("#collection-file")!;
  const preview = document.getElementById("collection-preview")!;
  const questions = document.getElementById("collection-questions")!;
  const status = document.getElementById("collection-status")!;
  const save = document.getElementById("download-questionnaire")!;
  let request: CollectionRequest | undefined;
  let selection = 0;

  choose.addEventListener("click", () => {
    input.value = "";
    input.click();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const current = ++selection;
    request = undefined;
    preview.hidden = true;
    questions.replaceChildren();
    setText(status);
    try {
      if (file.size > collectionLimit) throw Error("invalidCollectionRequest");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (current !== selection) return;
      request = readCollectionRequest(content);
      for (const question of request.questions) {
        const item = element("li");
        const title = element("strong", question.label);
        item.append(
          title,
          " ",
          text(
            "span",
            question.required ? "collectionRequiredMark" : "collectionOptional",
          ),
        );
        if (question.instructions)
          item.append(element("p", question.instructions));
        if (question.options) {
          const options = element("ul");
          options.append(
            ...question.options.map(({ label }) => element("li", label)),
          );
          item.append(options);
        }
        questions.append(item);
      }
      preview.hidden = false;
      preview.querySelector("h3")!.focus();
    } catch {
      if (current === selection) setText(status, "invalidCollectionRequest");
    }
  });

  save.addEventListener("click", () => {
    if (request)
      download(
        "collection-questionnaire.html",
        exportCollectionHtml(request, getLanguage()),
        "text/html;charset=utf-8",
      );
  });
}
