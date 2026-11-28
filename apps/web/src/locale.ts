import { element } from "./dom";
import { translate, type Language, type Message } from "./strings";

let language: Language = "en";
const selectors = "[data-text], [data-label]";

function update(node: HTMLElement) {
  const { text, label, argument } = node.dataset;
  if (text) {
    const translated = translate(language, text as Message, argument);
    if (node.textContent !== translated) node.textContent = translated;
  }
  if (label)
    node.setAttribute(
      "aria-label",
      translate(language, label as Message, argument),
    );
}

export function getLanguage() {
  return language;
}

export function setText(node: HTMLElement, key?: Message, argument?: string) {
  if (!key) {
    delete node.dataset.text;
    delete node.dataset.argument;
    if (node.hasChildNodes()) node.textContent = "";
    return;
  }
  node.dataset.text = key;
  if (argument !== undefined) node.dataset.argument = argument;
  update(node);
}

export function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  key: Message,
  argument?: string,
) {
  const node = element(tag);
  setText(node, key, argument);
  return node;
}

export function setLabel(node: HTMLElement, key: Message, argument?: string) {
  node.dataset.label = key;
  if (argument !== undefined) node.dataset.argument = argument;
  update(node);
}

export function setupLanguage(
  control: HTMLElement,
  onChange?: (value: Language) => void,
  initial?: Language,
) {
  const english = element("button", "English");
  const chinese = element("button", "简体中文");
  control.setAttribute("role", "group");
  setLabel(control, "language");
  control.classList.add("locale");
  control.append(english, chinese);
  english.type = chinese.type = "button";
  english.lang = "en";
  chinese.lang = "zh-CN";
  function apply(value: Language) {
    language = value;
    document.documentElement.lang = value;
    english.setAttribute("aria-pressed", String(value === "en"));
    chinese.setAttribute("aria-pressed", String(value === "zh-CN"));
    document.querySelectorAll<HTMLElement>(selectors).forEach(update);
    onChange?.(value);
  }
  english.addEventListener("click", () => apply("en"));
  chinese.addEventListener("click", () => apply("zh-CN"));
  apply(initial ?? (/^zh(?:-|$)/i.test(navigator.language) ? "zh-CN" : "en"));
}
