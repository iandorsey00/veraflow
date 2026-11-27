import { version } from "./branding";
import type { CollectionRequest } from "./collection";
import { inertJson } from "./html";
import { translate, type Language } from "./strings";

declare const COLLECTION_RUNTIME: string;
declare const COLLECTION_SCRIPT_HASH: string;
declare const FORM_STYLE: string;
declare const STYLE_HASH: string;

export function exportCollectionHtml(
  request: CollectionRequest,
  language: Language,
) {
  const title = translate(language, "collectionTitle");
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${COLLECTION_SCRIPT_HASH}'; style-src 'sha256-${STYLE_HASH}'; img-src data:; base-uri 'none'; form-action 'none'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <link rel="icon" href="data:,">
    <title>${title}</title>
    <style>${FORM_STYLE}</style>
  </head>
  <body class="standalone">
    <div class="topbar" id="language"></div>
    <main>
      <h1 data-text="collectionTitle">${title}</h1>
      <noscript>${translate(language, "noScriptForm")}</noscript>
      <form id="questionnaire" autocomplete="off" novalidate>
        <div id="questions"></div>
        <div class="actions">
          <button type="submit" class="primary" data-text="collectionDownloadResponse" disabled>${translate(language, "collectionDownloadResponse")}</button>
        </div>
        <p id="response-status" role="status"></p>
      </form>
    </main>
    <footer>VeraFlow Web v${version}</footer>
    <!-- Validated public request. -->
    <script type="application/json" id="collection-request">
${inertJson(request)}
    </script>
    <script>${COLLECTION_RUNTIME}</script>
  </body>
</html>
`;
}
