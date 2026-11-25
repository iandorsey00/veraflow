import { coreVersion, footer, version } from "./branding";
import { translate, type Language } from "./strings";
import { createDefinition, type PrefillOptions } from "./definition";

declare const EXPORT_LICENSES: string;
declare const FORM_RUNTIME: string;
declare const FORM_STYLE: string;
declare const SCRIPT_HASH: string;
declare const STYLE_HASH: string;

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inertJson(value: unknown) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
}

export function exportHtml(
  source: string,
  filename: string,
  options: PrefillOptions & {
    language?: Language;
    includeSourceName?: boolean;
  } = {},
) {
  const { content, ...template } = createDefinition(source, filename, options);
  const language = options.language ?? "en";
  const provenance = options.includeSourceName ? { sourceName: filename } : {};
  // Keep the source in readable lines while retaining original newline bytes.
  const sourceLines =
    content.match(/[^\r\n]+(?:\r\n|\r|\n)?|\r\n|\r|\n/g) ?? [];
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; style-src 'sha256-${STYLE_HASH}'; img-src data:; base-uri 'none'; form-action 'none'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <meta name="generator" content="VeraFlow Web v${version} (VeraFlow core v${coreVersion})">
    <link rel="icon" href="data:,">
    <title>${escapeHtml(template.name)}</title>

    <!-- Standalone form styles -->
    <style>${FORM_STYLE}</style>
  </head>
  <body class="standalone">
    <div class="topbar" id="language"></div>

    <!-- Form sections are populated by the offline runtime. -->
    <main id="form">
      <header>
        <h1>${escapeHtml(template.name)}</h1>
      </header>
      <noscript>${translate(language, "noScriptForm")}</noscript>
      <div id="step-context"></div>
      <div id="record-fields"></div>
      <section id="output-panel" class="output-panel"></section>
      <div id="form-actions"></div>
    </main>
    <footer id="form-footer">
      ${footer}
    </footer>

    <!-- Embedded definition. Source lines are JSON strings, including line endings. -->
    <script type="application/json" id="provenance">
${inertJson(provenance)}
    </script>
    <script type="application/json" id="definition">
${inertJson({ ...template, sourceLines })}
    </script>

    <!-- Bundled offline runtime -->
    <script>${FORM_RUNTIME}</script>

    <!-- Third-party licenses
${EXPORT_LICENSES}    -->
  </body>
</html>
`;
}
