import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Resolve shared-core dependencies against Web's own installation.
const alias = {
  "@humanwhocodes/momoa": fileURLToPath(
    import.meta.resolve("@humanwhocodes/momoa"),
  ),
};
const options = {
  alias,
  bundle: true,
  target: ["safari15.4", "chrome100"],
  minify: false,
  legalComments: "inline",
};
// Inline code is produced by the bundler. Refuse a closing tag instead of rewriting executable code.
function inline(text, name) {
  const content = text.replace(/\r\n?/g, "\n");
  if (new RegExp(`</${name}`, "i").test(content))
    throw new Error(`Unexpected </${name}> in inline asset`);
  return content;
}
const hash = (text) => createHash("sha256").update(text).digest("base64");
const runtime = await build({
  ...options,
  entryPoints: ["src/form.ts"],
  format: "iife",
  write: false,
});
const collection = await build({
  ...options,
  entryPoints: ["src/questionnaire.ts"],
  format: "iife",
  write: false,
});
const collectionScript = inline(
  "\n" + collection.outputFiles[0].text.trimEnd() + "\n    ",
  "script",
);
const css = inline(
  "\n" + (await readFile("src/style.css", "utf8")).trimEnd() + "\n    ",
  "style",
);
const script = inline(
  "\n" + runtime.outputFiles[0].text.trimEnd() + "\n    ",
  "script",
);
const license = await readFile("../../LICENSE", "utf8");
const momoaLicense = await readFile("vendor/momoa-LICENSE", "utf8");
const define = {
  COLLECTION_RUNTIME: JSON.stringify(collectionScript),
  COLLECTION_SCRIPT_HASH: JSON.stringify(hash(collectionScript)),
  EXPORT_LICENSES: JSON.stringify(license + "\n" + momoaLicense),
  FORM_RUNTIME: JSON.stringify(script),
  FORM_STYLE: JSON.stringify(css),
  SCRIPT_HASH: JSON.stringify(hash(script)),
  STYLE_HASH: JSON.stringify(hash(css)),
};
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("dist", { recursive: true });
const authoring = await build({
  ...options,
  define,
  entryPoints: ["src/web.ts"],
  write: false,
});
const webScript = authoring.outputFiles[0].text;
const webName = `web-${createHash("sha256").update(webScript).digest("hex").slice(0, 12)}.js`;
const styleName = `style-${createHash("sha256").update(css).digest("hex").slice(0, 12)}.css`;
const index = (await readFile("index.html", "utf8"))
  .replace("./web.js", `./${webName}`)
  .replace("./style.css", `./${styleName}`);
await Promise.all([
  writeFile(`dist/${webName}`, webScript),
  build({
    alias,
    bundle: true,
    define,
    target: "node22",
    platform: "node",
    format: "esm",
    entryPoints: ["src/cli.ts"],
    outfile: "dist/export-html.mjs",
  }),
  writeFile(`dist/${styleName}`, css),
  writeFile("dist/LICENSE", license + "\n" + momoaLicense),
  writeFile("dist/index.html", index),
  writeFile("dist/version.json", JSON.stringify({ version }) + "\n"),
]);
