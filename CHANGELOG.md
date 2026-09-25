# Changelog

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
