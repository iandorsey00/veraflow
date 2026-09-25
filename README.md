# VeraFlow 核流

A local, keyboard-driven desktop utility for turning reusable templates into verified text. Choose a template, capture each value from another app, verify against the original, and copy the finished snippet.

Built for macOS and Windows with Tauri 2, Rust, and TypeScript. No account, analytics, AI service, or application network API. This is an unsigned MVP; Windows runtime validation and release signing are still required before distribution.

![VeraFlow template editor with unique fields and capture order](docs/portfolio/screenshots/01-template-library.png)

## Run

Requirements: Node.js 22.12+ (tested with 24), current stable Rust, and platform build tools. macOS requires Xcode Command Line Tools; Windows requires Visual Studio Build Tools with Desktop development with C++ and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run desktop
```

For a browser-only UI preview: `npm run dev`. Preview libraries are memory-only and reset on refresh. Global shortcuts, native capture, tray, login items, and filesystem storage require the desktop app.

```sh
npm test
npm run check
npm run test:ui           # first run: npx playwright install chromium
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run desktop:build    # unsigned local platform bundle
```

macOS bundles appear under `src-tauri/target/release/bundle/`. Windows builds produce MSI/NSIS bundles on Windows. Release signing/notarization certificates are intentionally not included. CI builds and checks both platforms; it does not publish releases.

## Workflow

1. Create or edit a template with placeholders such as `<ticket_number>`, `<客户姓名>`, or `<地址>`. Repeated names share a field. Use a folder label to organize templates, and arrow buttons to change capture order.
2. Start a session. The same window becomes a small, resizable, always-on-top panel. Return to the source app and select text.
3. Press the capture shortcut. The panel stores the text and advances. You can also paste/type manually, or copy in the source app and choose **Use clipboard**. Cmd/Ctrl+Enter submits manual text.
4. After the last field, verification starts if enabled. Select each original value again and press the verification shortcut. A mismatch shows both values and emphasizes the differing span; it never overwrites the captured value.
5. Preview if desired, then choose **Copy result** or use the finish shortcut. Values are erased by default after successful copying. Skipped fields render as empty text.

Default global shortcuts use **Cmd/Ctrl+Shift+1…8**: capture, previous, next, clear, skip, verify/start verification, cancel, and finish. All are configurable in Settings, registered only during sessions, and paused while the template/settings screen is shown. Registration conflicts leave the previous set in place or report an error. Capture can also verify during the verification pass. Release shortcut modifiers promptly so the copy fallback can run.

The **Verify** shortcut starts the second pass when capture is complete; subsequent presses retrieve source text. Without automatic advancement, use next/previous and start verification explicitly. All populated fields must pass when verification is required. Clear a field to recapture it; corrections invalidate its verification. Cancellation, replacement, quitting an active session, and discarding unsaved changes require confirmation.

## Comparison

Comparison is deterministic and local. Newlines normalize CRLF and CR to LF. Optional NFC normalization handles canonically equivalent Unicode. Exact mode preserves spaces; whitespace mode trims and collapses whitespace, optionally preserving line boundaries. Case-insensitive comparison uses locale-independent Unicode lowercase, not language-specific case folding. Punctuation tolerance is off by default. Width variants, lookalikes (`0`/`O`), and fuzzy meanings do not match automatically. Comparison never transforms output values.

Names are case-sensitive Unicode runs between `<` and `>`, excluding whitespace, controls, and delimiters. Literal angle-bracket words also count as placeholders; this is a plain-text template format, not HTML. Replacement is literal and preserves surrounding formatting.

## Architecture and storage

- `src/core/`: pure parsing, comparison, rendering, and session state.
- `src/main.ts`, `src/style.css`, `src/locales/`: keyboard-accessible DOM UI and English / Simplified Chinese resources.
- `src/platform.ts`: desktop boundary and explicitly limited browser preview.
- `src-tauri/src/`: typed local persistence, tray, lifecycle, and native capture bridge.
- `src-tauri/native/`: Objective-C macOS and Win32 C++ clipboard adapters.

[Architecture decision](docs/architecture.md) records the framework tradeoffs and use of `../guidelines`. [Privacy and security review](docs/privacy-security.md) describes the limits of clipboard restoration and in-memory privacy. [Validation](docs/validation.md) distinguishes automated checks from manual release gates.

Templates and preferences are stored as `library.json` under the OS app-data directory: `~/Library/Application Support/com.veraflow.desktop/` on macOS and `%APPDATA%\com.veraflow.desktop\` on Windows. Writes replace the file atomically, with restrictive permissions on macOS. An unreadable library fails closed instead of being overwritten. Back up this file while the app is closed; restore it with the app closed. Templates themselves may contain sensitive static text and are not encrypted by VeraFlow.

Session values, mismatch candidates, and rendered output are never written to application storage or logs. Session persistence is not offered; quitting always drops in-process data. Erasing references is not secure memory wiping, and OS swap/crash dumps or clipboard managers are outside the app's control.

## Platform limitations

- **macOS:** grant VeraFlow Accessibility permission in System Settings → Privacy & Security → Accessibility. Capture first reads accessible selected text. If unsupported, it sends Cmd+C, snapshots readable clipboard formats up to 32 MiB, and restores them if the clipboard is unchanged. macOS has no atomic pasteboard compare-and-swap, so restoration remains best effort. Some apps expose neither selection nor Copy.
- **Windows:** uses Ctrl+C fallback. It preserves supported global-memory formats and refuses unfamiliar formats before copying when restoration is enabled. Elevated/protected apps may block synthetic input. VeraFlow does not request administrator privileges.
- Clipboard history, Universal Clipboard/cloud clipboard, other clipboard managers, delayed-copy operations, secure input, or another app changing the clipboard can prevent reliable restoration. No copy-result provenance can be guaranteed against another process writing at exactly the same time. Errors leave the field unchanged and offer manual capture.
- The source app must retain focus. Clicking VeraFlow's panel cannot retrieve a selection from a previously focused app; use the global shortcut from the source or the explicit clipboard/manual route.
- No crash reporting or telemetry is configured. The operating system may independently collect crash information. No guarantee is made against force quit, power loss, OS dumps, or malicious local software.

## Screenshots

Run `npm run dev`, then `npm run portfolio:capture`. The capture script uses only synthetic browser-preview data. See [screenshot manifest](docs/portfolio/README.md).

## Releases

See [release notes](CHANGELOG.md) and [build, installation, and rollback instructions](docs/release.md). Version consistency is checked with `npm run check:version`.

## License and source

VeraFlow © 2026 Ian Dorsey. Open source under the [MIT license](LICENSE).

[View the repository on GitHub](https://github.com/iandorsey00/veraflow). The app also includes these details under Settings → About; the repository link opens your default browser.
