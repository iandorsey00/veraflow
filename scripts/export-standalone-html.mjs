import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const cli = process.env.VERAFLOW_WEB_DIR
  ? pathToFileURL(resolve(process.env.VERAFLOW_WEB_DIR, "dist/export-html.mjs"))
  : new URL("../apps/web/dist/export-html.mjs", import.meta.url);
try {
  await access(cli);
} catch {
  console.error(
    "Build VeraFlow Web first with npm ci --prefix apps/web and npm run build --prefix apps/web.",
  );
  process.exit(1);
}
await import(cli.href);
