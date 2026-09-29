VeraFlow 核流 0.4.0 is an **unsigned preview** adding optional email templates and keyboard-driven section output. Email mode, Cc, and Bcc are disabled initially. Subject and To are required; all enabled sections share capture and verification.

| Platform                | Download                                |
| ----------------------- | --------------------------------------- |
| macOS 12+ Apple Silicon | `VeraFlow_v0.4.0_macos-arm64.zip`       |
| macOS 12+ Intel         | `VeraFlow_v0.4.0_macos-x64.zip`         |
| Windows x64             | `VeraFlow_v0.4.0_windows-x64-setup.exe` |

On macOS, extract the archive and move VeraFlow.app to Applications. These builds are not Developer ID signed or notarized. macOS may require per-app approval through System Settings → Privacy & Security → Open Anyway. Grant Accessibility permission for source-text capture. On Windows, run the installer; expect an unrecognized-publisher warning. WebView2 may be installed if absent. Only approve a download you trust; do not disable system-wide security protections.

Verify your chosen asset against `SHA256SUMS.txt` using `shasum -a 256 <file>` on macOS or `Get-FileHash <file> -Algorithm SHA256` in PowerShell. Node.js and Rust are not needed to run the app.

Automated checks cover frontend workflows and native compilation. Cross-app clipboard restoration, permission behavior, Intel runtime execution, Windows interactive acceptance, and assistive-technology testing are not fully validated. Use synthetic data while evaluating the preview. Clipboard restoration is best effort; sessions remain only in memory.

Before upgrading, quit VeraFlow and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Older libraries load normally, but binaries before 0.4.0 reject the saved email-template property. Restore your pre-upgrade library backup when downgrading. Downgrading to 0.2.0 requires its pre-upgrade backup because it rejects the added verification-background preference. Keep your previous binary for rollback. Quitting discards session values.

In email mode, prepare output, focus Subject in the destination, and press the configured finish shortcut (default Cmd/Ctrl+Shift+8) for each section. It pastes and presses Tab through Subject → To → enabled Cc/Bcc → Body; Body has no trailing Tab. The previous shortcut (Cmd/Ctrl+Shift+2) sends Shift+Tab. The destination must have the matching field order. Going back does not undo text; select existing content before repasting. Output replaces the clipboard, cannot confirm the destination accepted it, and never sends the email. Return to VeraFlow and press Cmd/Ctrl+Enter to finish after reviewing the Body. Real email-client acceptance remains a manual preview gate.
