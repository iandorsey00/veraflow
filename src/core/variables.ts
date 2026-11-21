export type TemplateContext = {
  timestamp?: Date;
  templateName?: string;
  outputName?: string;
  selection?: string;
  selectionOrClipboard?: string;
  clipboard?: string;
  csv?: { row: number; rows: number; file?: string };
};

type Variable =
  | { name: "date"; format: string; local: boolean }
  | {
      name:
        | "timestamp"
        | "template"
        | "output"
        | "row"
        | "rows"
        | "csv_file"
        | "selection"
        | "selection-or-clipboard"
        | "clipboard";
    };

const dateTokens = {
  Y: (iso: string) => iso.slice(0, 4),
  m: (iso: string) => iso.slice(5, 7),
  d: (iso: string) => iso.slice(8, 10),
  H: (iso: string) => iso.slice(11, 13),
  M: (iso: string) => iso.slice(14, 16),
  S: (iso: string) => iso.slice(17, 19),
  "%": () => "%",
};

export function templateVariable(text: string): Variable | undefined {
  switch (text) {
    case "@timestamp":
    case "@template":
    case "@output":
    case "@row":
    case "@rows":
    case "@csv_file":
    case "@selection":
    case "@selection-or-clipboard":
    case "@clipboard":
      return { name: text.slice(1) as Exclude<Variable["name"], "date"> };
    default: {
      const format =
        /^@date\s+(?:"([^"{}\r\n]*)"|'([^'{}\r\n]*)')(?:\s+(local))?$/.exec(
          text,
        );
      if (!format) return;
      const value = format[1] ?? format[2];
      if (value.length > 100 || !/^(?:[^%]|%[YmdHMSz%])*$/u.test(value)) return;
      return { name: "date", format: value, local: format[3] === "local" };
    }
  }
}

export function variableValue(variable: Variable, context?: TemplateContext) {
  switch (variable.name) {
    case "date":
    case "timestamp": {
      const date = context?.timestamp;
      if (!date || !Number.isFinite(+date)) return;
      const iso = date.toISOString();
      if (!("format" in variable)) return iso;
      const offset = variable.local ? -date.getTimezoneOffset() : 0;
      const clock = offset
        ? new Date(+date + offset * 60_000).toISOString()
        : iso;
      const zone =
        (offset < 0 ? "-" : "+") +
        String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0") +
        String(Math.abs(offset) % 60).padStart(2, "0");
      return variable.format.replace(
        /%([YmdHMSz%])/g,
        (_, key: keyof typeof dateTokens | "z") =>
          key === "z" ? zone : dateTokens[key](clock),
      );
    }
    case "selection":
      return context?.selection;
    case "selection-or-clipboard":
      return context?.selectionOrClipboard;
    case "clipboard":
      return context?.clipboard;
    case "template":
      return context?.templateName;
    case "output":
      return context?.outputName;
    case "row":
      return context?.csv?.row.toString();
    case "rows":
      return context?.csv?.rows.toString();
    case "csv_file":
      return context?.csv?.file;
  }
}
