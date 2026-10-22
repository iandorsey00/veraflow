VeraFlow 核流 0.7.0 is a **publisher-unsigned preview** adding a local table workspace and standalone Scanner.

- Organize folders, tables, and saved rows with permanent VeraFlow IDs, optional row titles, and labeled external references. Each row opens in Scanner.
- Free Scanner stays temporary until Save as row. Define fields one per line, infer them from a template, or import Scanner JSON. Saved values reopen as captured and require fresh verification.
- Copy, paste, rename, and verify individual fields; use Tab/Shift+Tab, Ctrl/Cmd+C on a focused field, or the nearby right-click menu. Mouse paste returns to the last external app; place the cursor in the destination first and inspect the result before retrying.
- Scanner opens at 360px and supports a 300px minimum without a horizontal page scrollbar. Long text and controls wrap.
- Use spaced placeholders such as `{{full name}}` in Scanner and email templates. Matching and missing Scanner fields are labeled and colored, with an Add missing fields action.
- Import UTF-8 CSV with a reviewable header suggestion, quoted/multiline cells, and comma/semicolon/tab detection. Values remain plain text; Excel sheets can be exported as CSV UTF-8 first.
- Exchange Scanner fields/values, tables, and the database as JSON. Value exports include private text; review before sharing. Imports add records rather than overwrite them.
- Keep the current email workflow, including explicit post-email Scanner transfer. New stock shortcuts use Ctrl+Alt on Windows and Cmd+Option on macOS, preserving custom bindings.

Download `VeraFlow_v0.7.0_windows-x64-setup.exe`, `VeraFlow_v0.7.0_macos-arm64.zip`, or `VeraFlow_v0.7.0_macos-x64.zip` from this release. Verify against `SHA256SUMS.txt`. Node.js and Rust are not needed. Install the Windows EXE or extract the macOS ZIP and move VeraFlow.app into Applications.

**Before upgrading:** quit through the tray menu and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Saved rows are local plaintext and persist after session exit. Old binaries reject new workspace/shortcut properties; rollback requires a compatible pre-upgrade backup. Test and public libraries are separate: use database and template JSON to transfer explicitly.

Update bundles retain mandatory signatures and authenticated versions. This release removes unused legacy ZIP updater support; Windows EXE updates and macOS application-archive updates remain supported. Apple Developer ID/notarization and Windows publisher signing are not configured. Expect per-app system approval or an unrecognized-publisher warning. Never disable system-wide protections.

Automated checks cover native compilation, storage, output guards, keyboard flows, and browser accessibility. They do not establish every real-app focus/paste, permission, Intel runtime, window snapping, assistive-technology, or in-place updater/relaunch behavior. No Send operation is emitted. Unsaved session values are cleared on exit; saved rows and exported files remain.
