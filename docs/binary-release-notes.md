VeraFlow 核流 0.6.0 is a **publisher-unsigned preview** adding configurable email paste order, optional Subject delivery, field-level blank-line cleanup, and mouse mode enabled by default.

- **Mouse transfer panel** starts enabled in each session. Turn it off for keyboard-only work. It remembers external app/window identity, and retrieves selected text only when you request Transfer or capture.
- **Email paste order** is saved per template. Use the up/down controls to match your email app. Body stays last, and optional disabled sections are excluded. Disable **Include Subject** and enable Cc for To → Cc → Body; handle Subject yourself in the email app. Existing templates keep their previous order and include Subject.
- **Remove blank lines** cleans only the selected captured field. Nonblank spacing stays unchanged. The field must be verified again; verification removes the same blank lines from source text. Clear and recapture to turn cleanup off. Cleanup is session-only and never exported.
- Email header order and Subject inclusion are included in JSON exports. Imports and native storage reject malformed header permutations. Old libraries/exports still load; older binaries need a compatible library backup when downgrading after saving these properties.
- Inherited recovery controls include session-only clipboard preservation, manual email Back/Next, individual verified-field backgrounds, specific error guidance, and Update now on the main page when available.
- Version 0.5.x can update through Settings → Update app. Versions 0.4.0 and earlier need a manual download.

| Platform                | Download                                |
| ----------------------- | --------------------------------------- |
| macOS 12+ Apple Silicon | `VeraFlow_v0.6.0_macos-arm64.zip`       |
| macOS 12+ Intel         | `VeraFlow_v0.6.0_macos-x64.zip`         |
| Windows x64             | `VeraFlow_v0.6.0_windows-x64-setup.exe` |

On macOS, extract the archive and move VeraFlow.app to Applications. These builds are not Developer ID signed or notarized. macOS may require per-app approval through System Settings → Privacy & Security → Open Anyway. Grant Accessibility permission for source-text capture. On Windows, run the installer; expect an unrecognized-publisher warning. WebView2 may be installed if absent. Only approve a download you trust; do not disable system-wide security protections.

Verify your chosen asset against `SHA256SUMS.txt` using `shasum -a 256 <file>` on macOS or `Get-FileHash <file> -Algorithm SHA256` in PowerShell. Node.js and Rust are not needed to run the app.

Automated checks cover frontend workflows and native compilation. Cross-app clipboard restoration, permission behavior, Intel runtime execution, Windows interactive acceptance, and assistive-technology testing are not fully validated. Use synthetic data while evaluating the preview. Clipboard restoration is best effort; sessions remain only in memory.

Before upgrading, quit VeraFlow and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Older libraries load normally, but binaries before 0.5.0 reject new shortcut preferences and placeholder-style properties. Restore your pre-upgrade library backup when downgrading. Downgrading to 0.2.0 requires its pre-upgrade backup because it rejects the added verification-background preference. Keep your previous binary for rollback. Quitting discards session values.

In email mode, prepare output, focus the first included section in the destination, and press the configured finish shortcut (default Cmd/Ctrl+Shift+8) for each section. It pastes and presses Tab through the configured section order, ending at Body; Body has no trailing Tab. The previous shortcut (Cmd/Ctrl+Shift+2) sends Shift+Tab. The destination must have the matching field order. Going back does not undo text; select existing content before repasting. Output replaces the clipboard, cannot confirm the destination accepted it, and never sends the email. Return to VeraFlow and press Cmd/Ctrl+Enter to finish after reviewing the Body. Real email-client acceptance remains a manual preview gate.

Update bundles are signed with VeraFlow’s update key, including an authenticated version. They are separate from publisher signing: macOS apps are still not Developer ID signed/notarized, and Windows installers still lack an Authenticode publisher certificate. Windows 11 and Intel macOS interactive updater acceptance remains outstanding; automated checks do not establish it.
