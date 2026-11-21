import { coreVersion, footer, version } from "./branding";
import { translate, type Language } from "./strings";
import { createDefinition } from "./definition";

declare const CORE_LICENSE: string;
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

export function exportHtml(
  source: string,
  filename: string,
  options: {
    language?: Language;
    includeSourceName?: boolean;
  } = {},
) {
  const template = createDefinition(source, filename);
  const language = options.language ?? "en";
  // File inputs and the CLI pass a basename. Store it only on explicit request.
  const metadata = options.includeSourceName ? { sourceName: filename } : {};
  const data = JSON.stringify(template).replaceAll("<", "\\u003c");
  const details = JSON.stringify(metadata).replaceAll("<", "\\u003c");
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
<style>${FORM_STYLE}</style>
</head>
<body class="standalone">
<div class="topbar" id="language"></div>
<main id="form">
  <header><h1>${escapeHtml(template.name)}</h1></header>
  <noscript>${translate(language, "noScriptForm")}</noscript>
</main>
<footer id="form-footer">${footer}</footer>
<script type="application/json" id="provenance">${details}</script>
<script type="application/json" id="definition">${data}</script>
<script>${FORM_RUNTIME}</script>
<!--
VeraFlow core license
${CORE_LICENSE}-->
</body>
</html>
`;
}
