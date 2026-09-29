# Changelog

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
