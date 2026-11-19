export type TemplateContext = {
  timestamp?: Date;
  templateName?: string;
  outputName?: string;
  csv?: { row: number; rows: number; file?: string };
};

type Variable =
  | { name: "date"; format: string }
  | { name: "timestamp" | "template" | "output" | "row" | "rows" | "csv_file" };

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
      return { name: text.slice(1) as Exclude<Variable["name"], "date"> };
    default: {
      const format = /^@date\s+(?:"([^"{}\r\n]*)"|'([^'{}\r\n]*)')$/.exec(text);
      if (!format) return;
      const value = format[1] ?? format[2];
      if (value.length > 100 || !/^(?:[^%]|%[YmdHMS%])*$/u.test(value)) return;
      return { name: "date", format: value };
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
      return "format" in variable
        ? variable.format.replace(
            /%([YmdHMS%])/g,
            (_, key: keyof typeof dateTokens) => dateTokens[key](iso),
          )
        : iso;
    }
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
