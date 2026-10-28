const bindings = new WeakMap<HTMLElement, AbortController>();
/** Only a drag started on this list can reorder it; external drops carry no authority. */
export function bindReorder(
  list: HTMLElement | null,
  move: (from: number, to: number) => void,
  enabled: () => boolean,
) {
  if (!list) return;
  bindings.get(list)?.abort();
  const controller = new AbortController();
  bindings.set(list, controller);
  const options = { signal: controller.signal };
  let source: number | null = null;
  const reset = () => {
    source = null;
    list
      .querySelectorAll(".drop-target")
      .forEach((el) => el.classList.remove("drop-target"));
  };
  list.addEventListener(
    "dragstart",
    (event) => {
      const handle = (event.target as HTMLElement).closest(
        "[data-drag-handle]",
      );
      const row = handle?.closest<HTMLElement>("[data-reorder]");
      if (!row || !enabled()) {
        event.preventDefault();
        return;
      }
      source = Number(row.dataset.reorder);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "VeraFlow field");
      }
    },
    options,
  );
  list.addEventListener(
    "dragover",
    (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-reorder]",
      );
      if (source === null || !row || !enabled()) return;
      event.preventDefault();
      list
        .querySelectorAll(".drop-target")
        .forEach((el) => el.classList.remove("drop-target"));
      row.classList.add("drop-target");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    },
    options,
  );
  list.addEventListener(
    "drop",
    (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-reorder]",
      );
      if (source === null || !row || !enabled()) {
        reset();
        return;
      }
      event.preventDefault();
      const from = source,
        to = Number(row.dataset.reorder);
      reset();
      if (from !== to) move(from, to);
    },
    options,
  );
  list.addEventListener("dragend", reset, options);
}
