# Changelog

## 0.24.0

- Review prepared Markdown and save it as PDF on macOS using local Pandoc and XeLaTeX. Save Markdown on its own if needed.
- Reuse recently used form files from JSON record review and declare a default named output in a form.
- Render JSON and JSON5 records from a source checkout with the headless CLI. Use the same native PDF converter on macOS.
- Introduce the black-and-white transfer icon and add bilingual résumé and dispatch PDF examples.

## 0.23.0

- Open or paste a flat JSON or JSON5 record from Home or an open form.
- Turn a record into a filled form with a summary or custom output. Review incoming changes before applying a record to a reusable form.
- Preserve quoted identifiers, literal placeholder text, and the difference between empty and unanswered values. Export fields as plain JSON.
- Add an English and Simplified Chinese JSON walkthrough and a fictional dispatch record to the demo archive.

## 0.22.1

- Show missing values and pending checks at the top of the form, with a shortcut to the next item.
- Keep extraction visible and group record, comparison, and CSV actions in Form tools.
- Show conflicts and ambiguous candidates first. Refine form and output layouts for narrow windows.
- Explain supported inputs, shared records, outputs, and external converters in both language guides.

## 0.22.0

- Acquire a selected text block, paste or read clipboard text, or open or drop a UTF-8 text file.
- Extract candidates from labeled lines, including field aliases and Chinese colons. Review evidence and resolve replacements or ambiguity before applying values.
- Import and export strict JSON candidate files, and export field descriptions for external extractors.
- Add a bilingual display replacement demo with fictional email and transcript evidence and a local paste destination.

## 0.21.0

- Accept JSON5 source headers and preserve strict JSON for record exchange.
- Let a step collect and verify with zero outputs, or prepare one or several named outputs.
- Review and merge an incoming JSON record while preserving checks on unchanged values.
- Reuse custom form values with a source form, and honor the window pin preference in full-size forms.
- Include a bilingual housing demo with a sample record and offline paste destination.

## 0.20.0

- Add optional form steps so fields can be entered and verified as information arrives. Each step prepares one named output from the same record.
- Flag prepared outputs for review when their inputs change, including sections that were already transferred.
- Show plain-text instructions in the preview and above a named output.

## 0.19.1

- Add optional plain-text instructions below individual fields, including accessible descriptions and multiline guidance.

## 0.19.0

- Combine typing, selection capture, and field verification in one Form.
- Set `"verify-by-default"` for a source form and use `"verify"` to override it on individual fields.
- Jump to missing values and pending checks from **Needs attention**. Unfilled optional fields start collapsed.
- Open a custom form with **Create form** and resume saved responses from **Recently opened forms**.
- Show optional source-file instructions below the form title.

## 0.18.0

- Add snippet collections with named clipboard actions, selection variables, and local timestamp formatting.
- Keep a snippet collection, a template session, and Free Scanner open in the same window.
- Offer clipboard confirmation and manual text entry after failed selection capture, and manual output after failed copying.

## 0.17.0

- Save filled template sessions locally and reopen their responses and verification status from Recent Sessions.
- Show the version in the launcher footer and move Free Scanner into the launcher toolbar.
- Add a screenshot of the sample dispatch form to the README.

## 0.16.0

- Switch between Form, Scanner, CSV browsing, and Append row. Preserve a working draft while browsing CSV.
- Review and append a row to an existing CSV, check for duplicates, and carry selected fields forward when starting the next record.
- Define structured spreadsheet rows in named outputs and copy a row for pasting into Excel.

## 0.15.0

- Add source comments, text comparisons, bounded list and range loops, formatted UTC dates, and linked CSV row variables.
- Accept nested per-output delivery settings while continuing to read existing settings.
- Remove blank lines automatically where configured. Preserve verified fields in prefilled copies, scoped to the workflow that checked them.
- Move the launcher update button into the top navigation and highlight the new syntax in the VS Code extension.

## 0.14.0

- Link a CSV in a source template and open directly to Output. Format row labels with CSV column placeholders.
- Cycle through named outputs in Form, Scanner, and CSV mode. The CSV row arrows move across outputs at row boundaries.
- Support CSV files up to 64 MiB and 100,000 data rows. Preserve exact, unique column names and support quoted field references in advanced templates.

## 0.13.0

- Generate independent named outputs from one shared record, switch between them on the Output page, and save the raw field values as JSON.
- Add Boolean negation, else-if branches, configurable filenames, and source text comparison with evidence.
- Show platform-specific shortcuts. New installations default to Cmd+Opt+X on macOS and Ctrl+Alt+X on Windows for output.
- Remember Form and Scanner window sizes and show available updates on the launcher.
- Fix keyboard focus and field copying after returning to Form or Scanner. Add a visible Copy field button in Scanner.

## 0.12.0

- Inline source conditions accept placeholders, single quotes, and line breaks between tokens. Grouped sections support a custom separator.
- Fill form puts choices first. Scanner offers direct choice controls. Prepared source output enters recent history, and the close dialog can return to filled responses.
- Prefilled files use the template title and UTC timestamp as the suggested name. The tray uses the standard app icon.
- Added Simplified Chinese installation, language, example, and VS Code guides.
- Public releases include the VS Code extension and verify its downloaded checksum.

## 0.11.0

- Reorder named output sections for the current session under **Paste options**. A custom order restarts at the first section and pastes one section at a time without navigation keys. Reset to recover the template order and previous paste settings.
- Text exports and recent output keep the template order.

## 0.10.0

- Open and search template folders from the launcher. Use ordinary files and subfolders to organize work.
- Open `.veraflow`, `.vf`, and CSV files directly. Use fill-in forms or Scanner, with live output preview, named paste sections, and single-step or sequence delivery.
- Keep failed paste output available for recovery. Save a prefilled session or finished text, and reopen recent output.
- Simplified the paste and end-session screens. Removed the old Workspace UI and kept compatibility with existing local libraries.

## 0.9.1

Published the portable template and workspace specification, shared rendering fixtures, and standalone Python reader. Typing and Scanner use the same final rendering and validation as the portable value-map entry point.

## 0.9.0

Unified Scanner and Typing workflows, opt-in Focused view, live previews, session restart, and form controls. Use `{{when field=option: "text"}}` for conditional output. Existing choice maps remain supported.

## 0.4.0 — 2026-09-29

- Optional per-template email mode with Subject, To, Body, and independently enabled Cc/Bcc, all off by default.
- Shared placeholders and verification across enabled sections; required Subject/To and single-line header validation.
- One-section-at-a-time native Paste+Tab using the finish shortcut; previous sends Shift+Tab. Body has no trailing Tab, and the app never sends email.
- Explicit session completion, clipboard/focus guidance, and backward-compatible loading of plain templates. Older binaries require a pre-email-template library backup when downgrading.
- Regression coverage for section ordering, disabled recipients, verification gates, failed output, navigation, persistence, and keyboard setup.

## 0.3.1 — 2026-09-28

- First downloadable unsigned preview binaries for macOS Apple Silicon, macOS Intel, and Windows x64.
- Tag-triggered packaging gated by macOS/Windows checks; SHA-256 checksums and download verification before publishing.
- Installation, preview limitations, and rollback instructions linked from the README.

## 0.3.0 — 2026-09-26

- Start the selected template with Cmd/Ctrl+Enter; open manual entry or submit and advance with the same shortcut.
- Navigate fields inside VeraFlow with Alt+Left/Right. Global capture and verification shortcuts advance after success even when automatic advancement is off.
- Optional green background after successful verification, off by default, with English and Simplified Chinese settings.
- Keep saved templates separate from editable drafts so duplication preserves the original.
- Generic project-update portfolio screenshots and expanded keyboard/persistence regression coverage.
- Existing libraries load with the new preference disabled. Back up the library before upgrading; 0.2.0 rejects the added preference on downgrade.

## 0.2.0 — 2026-09-24

Initial MVP preview, advancing the development scaffold from 0.1.0.

- Local template library with Unicode placeholders, unique fields, folders, and capture ordering.
- Compact desktop capture, configurable global shortcuts, deterministic second-pass verification, mismatch display, and explicit final copying.
- Native macOS selection retrieval and guarded clipboard fallback; Windows clipboard adapter.
- Memory-only sessions, typed local template/preferences storage, and session-loss guards.
- English and Simplified Chinese, light/dark appearance, keyboard access, tray and launch-at-login settings.
- Copyright, MIT license notice, and GitHub repository link under Settings → About.
- Core, persistence, shortcut, workflow, and accessibility checks; macOS/Windows CI.
- Release review rejects embedded NUL in macOS capture and aborts on Windows clipboard enumeration errors.

Unsigned preview: broad native clipboard/permission testing, Windows runtime acceptance, and release signing remain required before general distribution. See docs/validation.md.
