import type { Session } from "../vendor/veraflow/core/model";

type RenderedOutput = {
  id: string;
  label: string;
  sections: NonNullable<Session["prepared"]>;
};

export function outputJson(outputs: RenderedOutput[]) {
  const document = { format: "veraflow-render", version: 1, outputs };
  return JSON.stringify(document, null, 2) + "\n";
}
