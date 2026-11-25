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

export const shipmentExample = new URL(
  "../examples/shipment-steps.veraflow",
  import.meta.url,
);
export const shipmentSource = await readFile(shipmentExample, "utf8");
export const shipment = {
  firstReference: "VF-104",
  newReference: "VF-105",
  recipient: "Alex",
  tracking: "PK-12",
};

export const housingExample = new URL(
  "../examples/housing-application.vf",
  import.meta.url,
);
export const housingResponse = new URL(
  "../examples/housing-response.json",
  import.meta.url,
);

export function embeddedTemplate(html) {
  const { sourceLines, ...template } = JSON.parse(
    html.match(
      /<script type="application\/json" id="definition">([^]*?)<\/script>/,
    )[1],
  );
  return { ...template, content: sourceLines.join("") };
}

export const serviceExample = new URL(
  "../examples/service-intake.vf",
  import.meta.url,
);
export function serviceFile(name) {
  return new URL(`../examples/${name}`, import.meta.url);
}
