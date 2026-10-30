# MVP security review

## Boundaries reviewed

| Surface             | Implementation and residual limitation                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network             | No remote API, updater, analytics, fonts, images, or content requests. Production CSP permits bundled assets and Tauri IPC only. The frontend has no shell, HTTP, or general filesystem plugin. The Settings repository link opens a fixed GitHub URL in the default browser only when clicked; no template or session text is included. Development tooling downloads dependencies and runs a loopback server. |
| Capture             | Native operations use a process-local mutex; UI actions serialize and become inert while pending. AX selection on macOS precedes copy fallback. No shell commands or text-bearing process arguments. Active source application is checked.                                                                                                                                                                      |
| macOS permissions   | AXIsProcessTrusted is checked. A localized error directs the user to Accessibility settings. No silent permission escalation. Permission revocation leaves the field unchanged.                                                                                                                                                                                                                                 |
| Clipboard snapshots | macOS eagerly materializes each pasteboard item's advertised data. Unreadable/promised or >32 MiB data aborts before Copy. Windows snapshots only documented global-memory formats (text, locale, DIB, file-drop, HTML, RTF, PNG), rejecting private/GDI/owner-display formats.                                                                                                                                 |
| Clipboard races     | Snapshot/capture generation checks and source focus checks reject observed races. Windows holds the clipboard open during final validation and restore. macOS lacks atomic compare-and-swap; an unavoidable check/write interval remains. Copy events from other processes cannot be attributed reliably. Late source writes can arrive after timeout.                                                          |
| Restore failure     | Field capture is rejected and a specific error appears. Partial OS restoration can still occur. The app never claims exact universal restoration. Disabling restoration explicitly leaves fallback copied text in the clipboard.                                                                                                                                                                                |
| Final output        | A deliberate copy action replaces the clipboard. Nothing clears the final output automatically because it is meant to be pasted. Clipboard history or sync can retain either temporary or final output.                                                                                                                                                                                                         |
| Persistence         | Typed deserialization rejects unknown session properties. Only template/preference schema accepted; explicit size/version checks; atomic replacement via tempfile. No session export, browser storage, session database, or content log calls. Template content is plaintext and may itself be sensitive.                                                                                                       |
| Temporary files     | Only template/preference writes use a temporary file in app data. Restrictive Unix permissions; Windows uses inherited app-data ACLs. Session values never enter temp files. Aborted template saves may leave recoverable metadata on disk.                                                                                                                                                                     |
| Rendering           | All user strings are escaped before HTML insertion; clipboard output uses literal replacement callbacks. No HTML rendering of templates, remote content, or executable placeholder syntax. Prototype-like names use Maps or array fields rather than object assignment.                                                                                                                                         |
| Hotkeys             | Configurable, session-only registration with conflict rollback. Source app stays focused; no mouse automation. OS-reserved keys and software conflicts may reject registration.                                                                                                                                                                                                                                 |
| Lifecycle           | One instance; one session owner; window close hides by default. App quit and session replacement ask before erasure. OS force-quit/reboot cannot be reliably intercepted.                                                                                                                                                                                                                                       |
| Logs and crashes    | No application content logging or crash reporter. Error messages are fixed codes. Framework/OS diagnostics may still exist. JS/Rust/Objective-C memory is not securely zeroed; OS swap/dumps, webview process memory, and other local software remain outside the guarantee.                                                                                                                                    |

## Release checklist

- Run the manual native matrix in `validation.md` on both operating systems.
- Review `npm audit` and a Rust advisory audit before signed releases. Lockfiles are committed for reproducible dependency resolution.
- Verify code signing/notarization and Windows installer trust on clean machines.
- Recheck source-app focus, identical successive selections, rich clipboard restoration, timeout, conflicting clipboard writes, permission denial, and shortcut collisions.
- Never use production customer data for screenshots or test diagnostics.

This review covers the code in this repository. It is not an independent security audit or a guarantee about operating-system behavior.

## Dependency review for 0.2.0 (2026-09-24)

`npm audit` reported zero vulnerabilities. `cargo audit` reported zero vulnerability-class advisories, with the following informational findings retained for visibility (none are suppressed):

| Package                  | Advisory          | Classification |
| ------------------------ | ----------------- | -------------- |
| proc-macro-error 1.0.4   | RUSTSEC-2024-0370 | unmaintained   |
| unic-char-property 0.9.0 | RUSTSEC-2025-0081 | unmaintained   |
| unic-char-range 0.9.0    | RUSTSEC-2025-0075 | unmaintained   |
| unic-common 0.9.0        | RUSTSEC-2025-0080 | unmaintained   |
| unic-ucd-ident 0.9.0     | RUSTSEC-2025-0100 | unmaintained   |
| unic-ucd-version 0.9.0   | RUSTSEC-2025-0098 | unmaintained   |
| glib 0.18.5              | RUSTSEC-2024-0429 | unsound        |

The `unic-*` maintenance warnings arrive through Tauri’s `urlpattern` dependency. They remain an upstream maintenance risk; replacing them would require an upstream Tauri/urlpattern update or a separately reviewed fork. The `glib` unsoundness and `proc-macro-error` maintenance findings concern the GTK dependency tree retained in the cross-platform lockfile; glib is absent from both supported target graphs (macOS and Windows). Linux is not a supported VeraFlow target. No advisory-ignore configuration was added. Re-run the audits before distributing signed binaries.

## Dependency and distribution review for 0.3.1 (2026-09-28)

Fresh npm and Rust advisory audits reported zero vulnerabilities. The same six unmaintained-package advisories and one glib unsoundness advisory listed above remain visible; dependencies were not changed. The release workflow grants write access only to its publication job. Packaging jobs run with read-only repository access, and all platform checks/builds must succeed before publication. Release assets are downloaded and checked against their SHA-256 sums before the draft becomes a public prerelease. Checksums verify bytes, not publisher identity; binaries are explicitly unsigned and native interactive acceptance remains incomplete.

## Email output review for 0.4.0

Email mode adds an explicit delivery phase after the existing verification gate. Header templates are stored as ordinary template text; captured/rendered values and the output cursor remain in memory. Disabled Cc/Bcc sections are omitted from capture and output. Resolved headers reject control characters, and Subject/To cannot be empty. This is not email-address validation.

The native bridge serializes clipboard operations, rejects embedded NUL and oversized output, requires another app to be foreground, waits for shortcut modifiers to release, and rechecks foreground identity. macOS also requires Accessibility permission. Commands only emit Paste plus optional Tab, or Shift+Tab; no Return or Send event is generated. It deliberately replaces the clipboard and does not restore it. It cannot confirm paste consumption, recipient-chip behavior, or destination focus within a window. A fixed 200 ms interval before Tab is best effort, not a delivery guarantee. Partial failures may already have pasted text; retry guidance makes this explicit. The completion message describes requested paste operations rather than email delivery.

Fresh 0.4.0 audits on 2026-09-29 reported zero npm vulnerabilities and zero Rust vulnerability-class advisories. The six unmaintained and one glib unsoundness informational advisories documented above remain unchanged and unsuppressed.

## 0.5.0 updater and template exchange review

The updater uses an embedded public key, HTTPS-only feed, repository-bound versioned download URLs, and required signed-version verification. Private signing material is ignored by Git and is provided to release packaging through a repository Actions secret only. Native commands retain the checked update internally; the frontend cannot submit a replacement download URL or key. Installation consumes that checked update, serializes attempts, refuses active/unsaved work, verifies before installing, and restarts. UI release notes are escaped. Failures produce recovery guidance without logging release credentials or session data. Normal quit is blocked during installation. The updater contacts GitHub once on desktop startup and on explicit checks/downloads; it sends ordinary request metadata but no template or session values.

JSON archives contain saved template definitions only, are size/type/field validated, and add new template IDs after confirmation. Unknown fields such as session data and app preferences are rejected. Imports never overwrite existing templates. Literal template text can contain private information and should be reviewed before sharing. Native file dialogs restrict writes to a user-chosen path; exports are atomically replaced.

Mouse mode polls external application/window identity only while enabled in a capture/verification session. It does not monitor selected text. Transfer is explicit, restores external focus, then uses the existing serialized capture adapter. Selection may be lost in some applications. It resets off in new sessions.

Fresh audits on 2026-09-29 report zero npm vulnerabilities and zero Rust vulnerability-class advisories. The same six unmaintained dependencies and one unsupported-Linux glib unsoundness advisory remain visible. Native updater and mouse behavior on Windows/Intel macOS still require interactive acceptance.

## 0.5.1 recovery changes

Clipboard preservation remains enabled by default and still refuses formats that cannot be safely restored. An explicit session-only checkbox permits replacing the clipboard on subsequent capture attempts; it resets from the saved preference in each new session. Unsupported formats are never silently discarded under the preservation setting. Manual email navigation changes only the in-memory cursor and never emits keyboard events. It does not establish that any paste succeeded; completion asks the user to review every section. Held modifiers time out separately before injection, and source-focus, Accessibility, and clipboard-busy failures retain specific recovery messages. Native modifier-release waiting is bounded at three seconds. Startup update checks do not install, interrupt editing, or display network failures; installation retains the existing active/unsaved-work guards and confirmation.

Fresh 2026-10-07 npm auditing identified GHSA-68fv-2mgg-jv7q in source-map-js 1.2.1. The lockfile now uses patched 1.2.2, and the refreshed npm audit reports zero vulnerabilities. This dependency is in the build-tool chain. See the [upstream advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

The fresh Rust advisory audit reports zero vulnerability-class advisories. The six unmaintained-package findings and one unsupported-Linux glib unsoundness finding documented above remain visible and unsuppressed.

## 0.6.0 mouse, email-order, and blank-line changes

Mouse mode starts enabled per the user's requested default, and can be turned off in each session. Polling still reads external application/window identity only; selection text is retrieved only on explicit Transfer or capture. Email order and Subject inclusion are template metadata stored/exported as optional backward-readable fields. Required To and final Body cannot be omitted or duplicated; both native storage and JSON import validate the header permutation. Excluded Subject text is omitted from field collection and output. No Send event is introduced. Explicit blank-line cleanup affects only the selected session field, invalidates its verification, and applies the same cleanup to later candidates for that field. Clearing or session erasure removes the cleanup flag; it is never persisted or exported.

Fresh 2026-10-09 audits report zero npm vulnerabilities and zero Rust vulnerability-class advisories. The same six unmaintained-package advisories and unsupported-Linux glib unsoundness advisory remain visible and unsuppressed.

## 0.6.1 clipboard defaults and header validation

Clipboard restoration becomes explicit opt-in. A one-time persisted marker turns the old enabled default off for existing libraries without overwriting templates or other preferences. Once configured, future explicit opt-in is retained. The UI explains that capture replaces the clipboard by default. Restoration's existing unsupported-format protection remains available when opted in.

Only rendered email headers and their substituted values lose surrounding whitespace after verification. Raw captured fields and Body remain untouched. Internal control characters and Unicode line/paragraph separators remain blocked rather than being flattened into ambiguous recipient lists. A typed error identifies the section without exposing its text in logs. No Paste/Tab/Send behavior or recipient identity is rewritten.

Publisher credentials are absent on both platforms. Existing updater signatures remain mandatory; preview labeling stays accurate. The signing setup guide links current primary platform integration guidance without storing credentials or enabling unverified fallback signing.

The 2026-10-14 audit identified RUSTSEC-2026-0346 through RUSTSEC-2026-0349 in rustls 0.23.45. A targeted lockfile update to 0.23.46 fixes these findings without updating unrelated dependencies. Refreshed npm and Rust audits report zero vulnerabilities; the same six unmaintained-package and unsupported-Linux glib unsoundness informational findings remain unsuppressed. See the [upstream rustls release](https://github.com/rustls/rustls/releases/tag/v%2F0.23.46).

## 0.6.2 window and ordering changes

Window restoration is limited to the invoking app window. The native command accepts a boolean transition, obtains the HWND internally, and serializes placement access. It does not inspect or resize external source windows. The only new frontend window permission is setting VeraFlow's position; size/position reads are already in the existing core permission set.

Dormant field names are template metadata, retained without captured values. Active field collection still excludes disabled email sections. No schema, clipboard, network, or update-trust changes are introduced. The 2026-10-15 audits found zero npm vulnerabilities and zero Rust vulnerability-class advisories. The six existing unmaintained-package warnings and unsupported-Linux glib warning remain unsuppressed.

The audit also identified two newly yanked transitive releases. yoke-derive was updated from 0.8.3 to compatible 0.8.4. The updater requires zip ^4, whose entire available 4.x series is yanked; its existing checksum-locked 4.6.1 is retained pending an upstream compatible replacement. This is a visible dependency warning, not a vulnerability advisory; no audit suppression or updater trust change is applied.

## Scanner and isolated Windows test builds

Selected-text capture remains explicit. Scanner values, verification candidates, and optional retained snapshots stay in memory and are excluded from Library and JSON template exports. Individual output checks the active field and rejects mismatches even when verification is disabled. Template handoff excludes mismatches and resets verification to the template's policy. Retained snapshots participate in native exit/update guards, frontend unload protection, and quit confirmation. Source selection monitoring and clipboard protections are unchanged.

Test installers use a separate identifier/data directory and product name. Native compile-time test-build checks block both update commands, not only UI actions. The Check workflow receives no updater secret and publishes expiring Actions artifacts only, with commit metadata and a checksum. Signing credentials remain unavailable. Both app variants can collide on default global shortcuts; test with production VeraFlow closed. The public feed is not touched by test builds.

## Post-email Scanner transfer

Email completion holds fields in a guarded review state until an explicit transfer-or-clear choice. It does not silently retain them as a completed, unguarded session. Scanner transfer copies values in memory before erasure and preserves the comparison policy under which they were verified. Clear and close clears email fields plus any retained Scanner snapshot. Quit confirmation, updater blocking, and unload protection include review. No session data is written to the library or template JSON.

Existing templates, placeholder syntax, and custom shortcuts are preserved. One-time default shortcut migration normalizes modifier aliases to avoid introducing collisions and respects subsequent explicit changes. Its optional marker is stored without session values; old binaries reject this new property, so rollback requires a compatible pre-upgrade library backup. New email examples are added to existing libraries only on request.

## Workspace persistence and JSON (October 20 test build)

The user explicitly authorized local row persistence. Prior memory-only statements apply to unsaved sessions and Free Scanner, not saved table rows. Workspace values and labeled external references are plain local library data: no sync, new network access, analytics, or encryption is introduced. Export database/table JSON includes saved values; Scanner value export requires an explicit action and confirmation. Structure-only Scanner JSON excludes values. Template archives remain unchanged. Database archives exclude preferences and standalone template libraries.

Native Library adds an optional Workspace with deny_unknown_fields on every record. Frontend validation rejects unsupported versions/properties, invalid identities/references, duplicate names/IDs, oversized records, and columns outside the table schema. The existing 16 MB native read/write boundary and atomic replacement apply. Archives add records, remap collisions and folder links, and do not overwrite. Verification/candidate metadata is neither persisted nor imported as trusted state; reopening resets verification. Mismatches cannot overwrite saved rows. Text and IDs are HTML escaped, and record lookups use own properties so field names do not expose inherited object properties.

New output focus restoration runs under the clipboard lock through the existing native remembered-source adapter, then uses the existing checked Paste path. The frontend cannot choose arbitrary native window handles. It emits no Send or Enter. Focused targets and actual consumption still require Windows interactive acceptance. No dependencies or updater trust settings changed in this work; prior dependency-audit limitations remain, and no fresh audit is claimed here.

Back up the test library before upgrading. Older builds reject the new workspace property; rollback requires a compatible pre-upgrade backup. Separate production app data remains unaffected. Deleting unsaved Scanner data does not delete saved rows or exported files.

## 0.7.0 CSV, placeholders, thin windows, and release audit (October 21)

CSV uses the existing user-chosen import dialog with a CSV filter, no arbitrary frontend path input and no new permissions. Parse limits bound source bytes, rows, columns, cell size and expanded JSON size before allocating repeated header/value objects. Quoted cells, escaped quotes and multiline values remain literal strings. Ragged rows, NUL, invalid quoting and unsupported formats fail before persistence. The preview is HTML escaped and requires an explicit table name/import action; its header checkbox lets the user correct a heuristic. Imports create fresh IDs and do not overwrite existing records. No spreadsheet formulas, macros, or external links execute. No XLSX parser was added.

Scanner and email share brace tokenization with internal spaces, trimmed delimiter padding, and rejected control/line separators. Legacy angle parsing is unchanged. Template-only field inference is validated through the same named-field boundary. Narrow layouts change no output or clipboard trust rules.

The October 21 npm audit found Vite advisories through 7.3.6; 7.3.7 fixes them. Rust auditing found certificate-validation advisories RUSTSEC-2026-0382/0383, fixed by rustls-webpki 0.103.16 and webpki-root-certs 1.0.10. It also found zip extraction advisories RUSTSEC-2026-0367/0368/0369 in the updater's unused legacy ZIP feature. Disabling that feature removes zip 4.6.1 from the lockfile. The supported feed uses signed EXE on Windows and signed tar.gz on macOS, with macOS archive support retained independently. Updater signature/version checks, download restrictions, and the private signing key are unchanged. Refreshed audits report zero vulnerabilities; nine unmaintained-package warnings and the existing unsupported-Linux glib warning remain visible and unsuppressed. No advisory ignore was added.

## 0.7.1 extra Scanner definitions

Only field-name definitions are added to persisted Template/JSON metadata. Unknown objects, embedded value/status/candidate records, duplicate archive names, invalid/control names, excessive names/lengths are rejected at the relevant typed boundaries. Blank/duplicate editor lines normalize before saving. No new permission, network destination, clipboard adapter, or dependency is introduced.

Extra capture values follow existing session-only storage and comparison rules. Output rendering uses only actual placeholders; unused extras never enter text or email headers. Ordinary completion with extras deliberately enters guarded review, deferring clearAfterCompletion until transfer or clear is chosen. Review stays included in quit/update guards. Transfer clones fields in memory before erasing the source; Clear closes and erases retained Scanner snapshots as well. Library/template exports cannot serialize session values. Explicit row saving and Scanner value export remain separate actions. Older binaries reject extraFields and require a compatible library backup for rollback.

0.7.2 review: individual template exchange reuses the strict bounded archive parser. Imports require one definition, receive fresh IDs, and never overwrite originals. Export validates the current draft, excludes session values, and does not implicitly persist edits. The native filename allowlist adds only veraflow-template.json. No new dependencies or privileges.

0.7.3 review: internal drag payloads contain only a generic label, never captured values. Only a locally started drag on the same list can reorder; external drops have no import authority. Native WebView file-drop interception is disabled without adding permissions or file access. Verification objects remain attached to fields. Update busy/confirmation/signature guards are unchanged. Windows DPI context is scoped and restored. Fresh audits found a Tokio I/O-safety advisory; compatible 1.53.3 is applied before publication.

0.7.4 paste/reverification review: only focused session field buttons consume plain-text paste events; dialogs and editable controls retain normal paste. Clipboard text is read synchronously from the user-initiated event, without requesting clipboard-read permissions or retaining rich content. Existing size/empty-input checks apply. Reverification preserves captured values, removes selected verification/candidates, and keeps unrelated fields unchanged. No persistence, native permissions, updater trust or dependency changes.

0.8.0 snippet review: saved text/titles are plaintext in the atomically replaced local library and included in explicit snippet/table/database exports. Snippet fields never interpolate or execute; titles/previews/full text are escaped. Import schemas reject unknown keys, dangling table references, duplicate IDs and invalid/oversized content; standalone imports generate new IDs. Deleting a table preserves snippets in Unfiled. Dialog drafts activate existing quit guards. Source-window tracking for visible snippets stores a native window/app reference only; it does not capture selected text or read the clipboard. Copy and paste replace clipboard text deliberately. Paste runs only from its button, uses existing modifier/focus/size checks, emits no Tab/Send, and does not mutate saved text on failure. Native cross-app acceptance remains manual. Back up before saving new metadata because 0.7.4 cannot read it.

Selected snippet cards accept Ctrl/Cmd+V or Ctrl/Cmd+C to transfer their literal text to the clipboard, plus the mouse Transfer to clipboard button. Editable controls retain native paste, and an existing text selection keeps standard Ctrl/Cmd+C behavior. Snippet lists are collapsed by default inside tables.
