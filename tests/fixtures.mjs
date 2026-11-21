import { readFile } from "node:fs/promises";

export const example = new URL(
  "../examples/service-case.veraflow",
  import.meta.url,
);
export const script = new URL("../dist/export-html.mjs", import.meta.url);
export const source = await readFile(example, "utf8");
export const inputs = {
  case: "SV-1042",
  tracking: "ZX 902 17",
  customer: "林 Mei {{case}}",
  route: "ground",
};
export const expected = {
  subject: "Shipment for case SV-1042",
  body: "Hi 林 Mei {{case}},\nYour Ground service shipment is on the way. Tracking: ZX 902 17.\n",
  note: "Case SV-1042 | Customer: 林 Mei {{case}} | Tracking: ZX 902 17 | Ground service\n",
};
