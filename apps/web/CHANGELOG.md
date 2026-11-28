# Changelog

## 0.6.0

- Turn Desktop collection requests into self-contained offline questionnaires and download correlated responses for review in Desktop.
- Build from `apps/web` in the VeraFlow repository using the shared core. Web keeps its own version, dependencies, static assets, and `web-v` release tags.

## 0.5.0

- Open JSON or JSON5 from a file or clipboard and review values before creating a summary, writing an output, or filling a reusable form.
- Import reviewed records into standalone HTML forms and preserve verification for unchanged fields.
- Use the VeraFlow Desktop 0.25.0 core and honor the template's default named output.
- Download prepared outputs as versioned JSON compatible with the Desktop CLI.
- Add English and Simplified Chinese guides for the offline form and Desktop CLI workflow.

## 0.4.0

- Bring standalone bulk extraction to parity with VeraFlow Desktop 0.22.0.
- Extract labeled text offline and review alternatives and evidence before applying changes.
- Import and export candidate JSON separately from flat response records.

## 0.3.0

- Match VeraFlow Desktop 0.21.0 with JSON5 metadata, collection-only steps, and one or several named outputs per step.
- Add opt-in prefill and strict JSON response downloads that preserve omitted, null, and empty values.
- Format the self-contained HTML for source inspection and include the bilingual housing fixture.
- Show **Update app…** when a newer hosted build is available. Add a CLI `--update` command for clean source checkouts.

## 0.2.1

- Add optional UTC timestamps to HTML export and text download filenames. The HTML exporter CLI supports `--timestamp`.
- Move Needs attention below the output controls.

## 0.2.0

- Export stepped forms with one shared record, earlier-field review, and separate copy and navigation controls.
- Show output instructions beside each output. Flag affected steps after an edit and keep copied sections flagged until they are regenerated and copied again.
- Use the VeraFlow 0.20.0 core and its shipment fixture for desktop output parity.

## 0.1.1

- Add `npm start` to build and serve the authoring page locally.
- Enlarge the main-page wordmark and simplify the footer to the copyright, MIT license notice, and GitHub link.

## 0.1.0

- Export a VeraFlow template as a self-contained HTML form from the browser or CLI.
- Fill and verify fields offline, preview named output, and copy or download the results.
- Switch between English and Simplified Chinese in the exporter or the exported form.
- See the core version and optional source filename under Form details.
