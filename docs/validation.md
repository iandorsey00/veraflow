# Validation record

## Checked in this workspace

- TypeScript strict checks and optimized Vite production build.
- Eight core test groups: Unicode/unique placeholders, manual order, literal rendering, normalization combinations, difference spans, verification transitions, skip/clear/navigation, and memory erasure.
- Five Rust tests: backward-compatible preference default, normalized shortcut aliases/invalid keys, plus persistence valid round trip, rejection of session-shaped properties at each boundary, and invalid metadata/rules/duplicate IDs.
- Seven Playwright scenarios: keyboard start/entry/navigation with automatic advancement disabled and optional verified background, capture → mismatch → verify → copy → erase, template lifecycle/order/unsaved guard, Chinese/dark/narrow layout, session retention/cancel guard, and axe WCAG A/AA checks for light and dark editor/capture views.
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

## 0.3.1 distribution validation

Local version consistency, formatting, eight core tests, five Rust tests, Clippy, native macOS text conversion, and seven sequential browser/accessibility scenarios passed. Fresh npm and Rust audits found no vulnerability-class advisories; retained informational advisories are recorded in privacy-security.md. The first concurrent browser run encountered dev-server reloads during native-generated file writes; the sequential rerun after compilation passed. Release CI gates packaging on the same checks, and verifies uploaded/downloaded asset checksums before publication. Compilation and archive integrity do not establish native interactive acceptance on Intel macOS or Windows.

## 0.4.0 email release

Eleven core/email tests, six Rust tests, and eight browser/accessibility scenarios pass locally. Coverage includes shared placeholders, disabled Cc/Bcc exclusion, header control-character rejection, required Subject/To, verification gating, failed output without cursor advancement, back navigation, no trailing Tab after Body, persistence compatibility, and keyboard email setup. Formatting, version consistency, strict frontend build, Clippy, and native macOS conversion checks pass. Audits report zero vulnerability-class findings with the previously documented informational warnings retained. Portfolio images include a synthetic email template scene.

Native Paste/Tab delivery is compiled but real email-client acceptance is still unverified. Before stable distribution, test synthetic drafts on macOS and Windows with each Cc/Bcc combination, slow paste handling, recipient chips, held modifiers, focus changes, missing permission, elevated Windows targets, failed/partial injection, backward navigation and explicit completion. Confirm no Send action occurs and inspect the destination before retrying failures. This release remains an unsigned preview.

## 0.5.0 updater and usability release

Local verification: 14 core/email/archive tests, seven Rust tests, and 16 browser/accessibility scenarios pass. Updater UI scenarios cover current-version results, escaped notes, decline without installation, explicit install confirmation, failed verification without automatic retry, network recovery, installation status, and active-session/unsaved-change guards. The shortcut regression simulates registration failure before any keypress and confirms the session still accepts manual input. JSON exchange confirms fresh IDs without overwrites; mouse-panel tests confirm opt-in/reset behavior. Strict frontend build, formatting, version metadata, Clippy, native macOS Unicode conversion, and fresh npm/Rust audits pass.

A real macOS arm64 updater bundle was built with the private signing key. Independent minisign verification accepted its signature and authenticated 0.5.0 version and rejected an altered copy. This verifies the package pipeline, not an actual app replacement/relaunch. Native Windows 11, Intel macOS, real mouse-source capture, and in-place update/restart acceptance remain unverified. Public binaries/feed are blocked until the repository signing secret is configured and all release CI jobs pass.
