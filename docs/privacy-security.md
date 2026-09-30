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

The updater uses an embedded public key, HTTPS-only feed, repository-bound versioned download URLs, and required signed-version verification. Private signing material is ignored by Git and is provided to release packaging through a repository Actions secret only. Native commands retain the checked update internally; the frontend cannot submit a replacement download URL or key. Installation consumes that checked update, serializes attempts, refuses active/unsaved work, verifies before installing, and restarts. UI release notes are escaped. Failures produce recovery guidance without logging release credentials or session data. Normal quit is blocked during installation. The updater does contact GitHub on explicit checks/downloads; it sends ordinary request metadata but no template or session values.

JSON archives contain saved template definitions only, are size/type/field validated, and add new template IDs after confirmation. Unknown fields such as session data and app preferences are rejected. Imports never overwrite existing templates. Literal template text can contain private information and should be reviewed before sharing. Native file dialogs restrict writes to a user-chosen path; exports are atomically replaced.

Mouse mode polls external application/window identity only while enabled in a capture/verification session. It does not monitor selected text. Transfer is explicit, restores external focus, then uses the existing serialized capture adapter. Selection may be lost in some applications. It resets off in new sessions.

Fresh audits on 2026-09-29 report zero npm vulnerabilities and zero Rust vulnerability-class advisories. The same six unmaintained dependencies and one unsupported-Linux glib unsoundness advisory remain visible. Native updater and mouse behavior on Windows/Intel macOS still require interactive acceptance.
