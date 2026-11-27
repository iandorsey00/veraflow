import { spawnSync } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CliError } from "./cli-options";
import { en } from "./locales/en";

export async function savePdf(
  markdown: string,
  destination: string,
  force: boolean,
) {
  if (process.platform !== "darwin")
    throw new CliError(
      "pdfPlatform",
      "PDF conversion is available on macOS. Use render to produce Markdown.",
    );
  const helper = fileURLToPath(
    new URL("../src-tauri/target/debug/examples/pdf_cli", import.meta.url),
  );
  try {
    await access(helper, constants.X_OK);
  } catch {
    throw new CliError(
      "pdfHelperMissing",
      "Build the PDF helper from the VeraFlow checkout with cargo build --manifest-path src-tauri/Cargo.toml --example pdf_cli.",
    );
  }
  const result = spawnSync(
    helper,
    [destination, ...(force ? ["--force"] : [])],
    {
      input: markdown,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const code = result.stderr.trim();
    switch (code) {
      case "pdfDestinationExists":
        throw new CliError(
          code,
          `Destination already exists · ${destination}. Use --force to replace it.`,
        );
      case "pdfPandocMissing":
        throw new CliError(
          code,
          "Pandoc was not found. Install it or select its executable in VeraFlow Desktop under Settings → PDF setup.",
        );
      case "pdfEngineMissing":
        throw new CliError(
          code,
          "XeLaTeX was not found. Install a TeX distribution with XeLaTeX or select its executable in VeraFlow Desktop under Settings → PDF setup.",
        );
      default:
        if (code && Object.hasOwn(en, code)) throw Error(code);
        throw new CliError(
          "pdfConvertFailed",
          "PDF conversion did not finish. Use render to check the prepared Markdown.",
        );
    }
  }
}
