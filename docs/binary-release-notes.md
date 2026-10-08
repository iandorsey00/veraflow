VeraFlow 核流 0.5.1 is a **publisher-unsigned preview** improving clipboard recovery, email navigation, verification highlighting, dialog clarity, and update discovery.

- If capture cannot safely preserve your clipboard, disable **Preserve clipboard for this session**, then retry the shortcut or Transfer. Capture will replace the existing clipboard; new sessions reset to the saved setting.
- Optional green backgrounds apply only to individual verified fields, never the whole window.
- Email output has manual Back/Next buttons and Alt+Left/Right navigation inside VeraFlow. The configured global Next shortcut advances without injecting keys. Inspect or fill the destination first; manual advance does not confirm a paste.
- Copy/paste waits up to three seconds for shortcut modifiers to release. Held keys, missing Accessibility permission, source focus, and busy clipboard errors now retain specific recovery guidance.
- Confirmation buttons name the action, such as **Erase session**, **Discard changes**, or **Update now**.
- Desktop startup quietly checks for an update; **Update now** appears on the main page only when one is available. Installation still requires confirmation and finished/saved work. Version 0.5.0 can use Settings → Update app; 0.4.0 and earlier need a manual upgrade.
- Cmd/Ctrl+Shift+N may conflict with your system or another app. Use Cmd/Ctrl+Alt+N when available; VeraFlow cannot override an occupied shortcut.
- Updated source-map-js to the patched 1.2.2 build dependency.

| Platform                | Download                                |
| ----------------------- | --------------------------------------- |
| macOS 12+ Apple Silicon | `VeraFlow_v0.5.1_macos-arm64.zip`       |
| macOS 12+ Intel         | `VeraFlow_v0.5.1_macos-x64.zip`         |
| Windows x64             | `VeraFlow_v0.5.1_windows-x64-setup.exe` |

On macOS, extract the archive and move VeraFlow.app to Applications. These builds are not Developer ID signed or notarized. macOS may require per-app approval through System Settings → Privacy & Security → Open Anyway. Grant Accessibility permission for source-text capture. On Windows, run the installer; expect an unrecognized-publisher warning. WebView2 may be installed if absent. Only approve a download you trust; do not disable system-wide security protections.

Verify your chosen asset against `SHA256SUMS.txt` using `shasum -a 256 <file>` on macOS or `Get-FileHash <file> -Algorithm SHA256` in PowerShell. Node.js and Rust are not needed to run the app.

Automated checks cover frontend workflows and native compilation. Cross-app clipboard restoration, permission behavior, Intel runtime execution, Windows interactive acceptance, and assistive-technology testing are not fully validated. Use synthetic data while evaluating the preview. Clipboard restoration is best effort; sessions remain only in memory.

Before upgrading, quit VeraFlow and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Older libraries load normally, but binaries before 0.5.0 reject new shortcut preferences and placeholder-style properties. Restore your pre-upgrade library backup when downgrading. Downgrading to 0.2.0 requires its pre-upgrade backup because it rejects the added verification-background preference. Keep your previous binary for rollback. Quitting discards session values.

In email mode, prepare output, focus Subject in the destination, and press the configured finish shortcut (default Cmd/Ctrl+Shift+8) for each section. It pastes and presses Tab through Subject → To → enabled Cc/Bcc → Body; Body has no trailing Tab. The previous shortcut (Cmd/Ctrl+Shift+2) sends Shift+Tab. The destination must have the matching field order. Going back does not undo text; select existing content before repasting. Output replaces the clipboard, cannot confirm the destination accepted it, and never sends the email. Return to VeraFlow and press Cmd/Ctrl+Enter to finish after reviewing the Body. Real email-client acceptance remains a manual preview gate.

Update bundles are signed with VeraFlow’s update key, including an authenticated version. They are separate from publisher signing: macOS apps are still not Developer ID signed/notarized, and Windows installers still lack an Authenticode publisher certificate. Windows 11 and Intel macOS interactive updater acceptance remains outstanding; automated checks do not establish it.
