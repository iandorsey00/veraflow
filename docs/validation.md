# Validation record

## Checked in this workspace

- TypeScript strict checks and optimized Vite production build.
- Eight core test groups: Unicode/unique placeholders, manual order, literal rendering, normalization combinations, difference spans, verification transitions, skip/clear/navigation, and memory erasure.
- Four Rust tests: normalized shortcut aliases/invalid keys, plus persistence valid round trip, rejection of session-shaped properties at each boundary, and invalid metadata/rules/duplicate IDs.
- Six Playwright scenarios: capture → mismatch → verify → copy → erase, template lifecycle/order/unsaved guard, Chinese/dark/narrow layout, session retention/cancel guard, and axe WCAG A/AA checks for light and dark editor/capture views.
- macOS native Objective-C and Rust compilation, Rust Clippy with warnings denied, and an unsigned arm64 macOS app bundle.
- Native macOS launch, session startup without shortcut registration errors, compact-window transition, cancellation guard, and template persistence across app restart.
- Synthetic screenshot review of editor, mismatch panel, and Chinese dark interface.
- Release 0.2.0: npm audit found zero vulnerabilities; cargo-audit found zero vulnerability-class advisories and seven informational warnings, detailed in privacy-security.md.
- Native macOS Unicode and embedded-NUL conversion test passed without accessing the clipboard.

Browser tests cover the real frontend workflow but use the browser clipboard, not the native adapters. An accessibility scanner is not a substitute for VoiceOver/NVDA testing. Native hotkey dispatch and cross-app capture/restore have not been fully exercised here. Windows code and CI configuration are present; no Windows runner was available in this workspace. GitHub Actions validates both platform builds; see the repository Actions page for current results. Native interactive acceptance remains separate from CI.

## Manual release gates (macOS and Windows)

Use synthetic text only. Preserve valuable clipboard data before testing OS-level capture.

1. Grant macOS Accessibility permission to the signed app; deny/revoke it and confirm a recoverable error with no accepted value. On Windows test ordinary and elevated source apps without elevating VeraFlow.
2. Capture and verify from native editors, browser text selections, multiline addresses, Chinese, repeated identical selections, and unsupported/secure controls. Check that the source retains focus and no extra keys remain held.
3. Test text, HTML/RTF, images, file lists, empty clipboard, unreadable/promised formats, and data above 32 MiB. Unsupported snapshots must refuse before Copy when restoration is on.
4. Change the clipboard or switch apps during capture; verify the field is unchanged on errors. Verify unchanged clipboard restoration on both platforms, and note limitations caused by delayed source writes or external clipboard managers.
5. Hold shortcut modifiers beyond one second; test timeout, registration collision, duplicate shortcut spellings, remapping, and rollback after partial registration. Confirm shortcuts are released after cancel/completion.
6. Verify an altered field loses its verified status; mismatch never silently accepts the candidate. Required verification must block copying until all populated fields pass. Skip must remain explicit.
7. Force a final clipboard-write failure and ensure values remain available for retry. Check successful final copy, default erasure, and optional retention until session closure.
8. Check tray/menu-bar actions, close-to-tray preference, launch-at-login, repeated app launches, quit with an active session, and quit with unsaved template/settings changes.
9. Confirm memory-only session data by inspecting the saved schema with synthetic fixtures. No captured values or output should appear in local app files or logs. Test corrupt library recovery without overwriting the original.
10. Use VoiceOver/NVDA, keyboard-only navigation, 200% text scaling, Windows high contrast, long field names, and both languages. Review minimum 360px window width and large displays.
11. Build, sign, and install release packages on clean macOS and Windows machines. Repeat permission tests using the distributed application identity; development permission grants may not transfer.

Do not mark release gates complete from compilation or browser results alone.
