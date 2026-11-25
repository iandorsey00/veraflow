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
      <div class="actions source-actions">
        <button id="extract-source" type="button" data-text="extractSource" disabled>Extract from source…</button>
      </div>
      <div id="step-context"></div>
      <div id="record-fields"></div>
      <section id="output-panel" class="output-panel"></section>
      <div id="form-actions"></div>
    </main>
    <footer id="form-footer">
      ${footer}
    </footer>

    <!-- Source acquisition and candidate review -->
    <dialog id="source-extraction" class="extraction-dialog" aria-labelledby="source-extraction-title">
      <form id="source-extraction-form">
        <h2 id="source-extraction-title" data-text="extractSource">Extract from source…</h2>
        <label for="extract-text" data-text="batchSource">Source text</label>
        <p id="extract-help" class="help" data-text="extractHelp">Paste labeled lines or drop one UTF-8 .txt file here.</p>
        <textarea id="extract-text" rows="7" aria-describedby="extract-help" autocomplete="off"></textarea>
        <div class="actions">
          <button id="extract-clipboard" type="button" data-text="readClipboard">Read clipboard</button>
          <button id="extract-open" type="button" data-text="openSourceText">Open text file…</button>
        </div>
        <details>
          <summary data-text="candidateFileTools">External extraction files</summary>
          <p class="help" data-text="candidateFileHelp">Add the original text above to check imported quotations against it.</p>
          <div class="actions">
            <button id="extract-import" type="button" data-text="importCandidates">Import candidates…</button>
            <button id="extract-fields" type="button" data-text="exportExtractionFields">Export field descriptions…</button>
          </div>
        </details>
        <input id="extract-file" type="file" accept=".txt,text/plain" hidden>
        <input id="candidate-file" type="file" accept=".json,application/json" hidden>
        <p id="extract-error" class="error" role="alert"></p>
        <div class="actions dialog-actions">
          <button id="extract-cancel" type="button" data-text="cancel">Cancel</button>
          <button id="extract-find" type="submit" class="primary" data-text="findCandidates">Find candidates</button>
        </div>
      </form>
    </dialog>

    <dialog id="candidate-review" class="extraction-dialog" aria-labelledby="candidate-review-title">
      <form id="candidate-review-form">
        <h2 id="candidate-review-title" data-text="reviewCandidates" tabindex="-1">Review candidates</h2>
        <p class="help" data-text="candidateReviewHelp">Select the values to apply. Verify required fields separately in the form.</p>
        <div id="candidate-results"></div>
        <p class="help" data-text="candidatePrivacy">Candidate files may include private values and quoted evidence.</p>
        <p id="candidate-review-error" class="error" role="alert"></p>
        <div class="actions dialog-actions">
          <button id="candidate-cancel" type="button" data-text="cancel">Cancel</button>
          <button id="save-candidates" type="button" data-text="saveCandidates">Save candidates…</button>
          <button id="apply-candidates" type="submit" class="primary" data-text="applyCandidates">Apply selected values</button>
        </div>
      </form>
    </dialog>

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
