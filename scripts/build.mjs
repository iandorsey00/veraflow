import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const options = {
  bundle: true,
  target: ["safari15.4", "chrome100"],
  minify: true,
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
const css = inline(await readFile("src/style.css", "utf8"), "style");
const script = inline(runtime.outputFiles[0].text, "script");
const license = await readFile("vendor/veraflow/LICENSE", "utf8");
const define = {
  CORE_LICENSE: JSON.stringify(license),
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
    bundle: true,
    define,
    target: "node22",
    platform: "node",
    format: "esm",
    entryPoints: ["src/cli.ts"],
    outfile: "dist/export-html.mjs",
  }),
  writeFile(`dist/${styleName}`, css),
  writeFile("dist/LICENSE", license),
  writeFile("dist/index.html", index),
  writeFile("dist/version.json", JSON.stringify({ version }) + "\n"),
]);
