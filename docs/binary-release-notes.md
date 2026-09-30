VeraFlow 核流 0.5.0 is a **publisher-unsigned preview** adding signed in-place updates, nonblocking shortcut startup, safer placeholder syntax, JSON template exchange, and an optional mouse transfer panel.

- **Update app** checks for a new version, shows release notes, and downloads, verifies, installs, and restarts after confirmation. Finish sessions and save changes first. Version 0.4.0 and earlier need this one manual upgrade to gain the updater.
- Shortcut registration errors identify the affected combination and no longer block starting a session. Disable individual/global shortcuts or try the alternate preset in Settings.
- New templates use `{{name}}`; existing `<name>` templates keep their syntax. Choose either style per template and escape literal delimiters with a backslash. Display-name email addresses stay literal in braces mode.
- Import/export saved templates as versioned JSON. Imports add copies and never overwrite existing templates.
- Mouse transfer panel is off by default. Select text in another app, then click Transfer in the floating panel. Back/Forward navigate fields. Selection retention varies by app; automatic selection popups are not included.

| Platform                | Download                                |
| ----------------------- | --------------------------------------- |
| macOS 12+ Apple Silicon | `VeraFlow_v0.5.0_macos-arm64.zip`       |
| macOS 12+ Intel         | `VeraFlow_v0.5.0_macos-x64.zip`         |
| Windows x64             | `VeraFlow_v0.5.0_windows-x64-setup.exe` |

On macOS, extract the archive and move VeraFlow.app to Applications. These builds are not Developer ID signed or notarized. macOS may require per-app approval through System Settings → Privacy & Security → Open Anyway. Grant Accessibility permission for source-text capture. On Windows, run the installer; expect an unrecognized-publisher warning. WebView2 may be installed if absent. Only approve a download you trust; do not disable system-wide security protections.

Verify your chosen asset against `SHA256SUMS.txt` using `shasum -a 256 <file>` on macOS or `Get-FileHash <file> -Algorithm SHA256` in PowerShell. Node.js and Rust are not needed to run the app.

Automated checks cover frontend workflows and native compilation. Cross-app clipboard restoration, permission behavior, Intel runtime execution, Windows interactive acceptance, and assistive-technology testing are not fully validated. Use synthetic data while evaluating the preview. Clipboard restoration is best effort; sessions remain only in memory.

Before upgrading, quit VeraFlow and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Older libraries load normally, but binaries before 0.5.0 reject new shortcut preferences and placeholder-style properties. Restore your pre-upgrade library backup when downgrading. Downgrading to 0.2.0 requires its pre-upgrade backup because it rejects the added verification-background preference. Keep your previous binary for rollback. Quitting discards session values.

In email mode, prepare output, focus Subject in the destination, and press the configured finish shortcut (default Cmd/Ctrl+Shift+8) for each section. It pastes and presses Tab through Subject → To → enabled Cc/Bcc → Body; Body has no trailing Tab. The previous shortcut (Cmd/Ctrl+Shift+2) sends Shift+Tab. The destination must have the matching field order. Going back does not undo text; select existing content before repasting. Output replaces the clipboard, cannot confirm the destination accepted it, and never sends the email. Return to VeraFlow and press Cmd/Ctrl+Enter to finish after reviewing the Body. Real email-client acceptance remains a manual preview gate.

Update bundles are signed with VeraFlow’s update key, including an authenticated version. They are separate from publisher signing: macOS apps are still not Developer ID signed/notarized, and Windows installers still lack an Authenticode publisher certificate. Windows 11 and Intel macOS interactive updater acceptance remains outstanding; automated checks do not establish it.
