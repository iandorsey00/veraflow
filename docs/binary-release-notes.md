VeraFlow 核流 0.6.2 is a **publisher-unsigned preview** improving session layout, window restoration, and capture-order persistence.

- Restore pre-session window bounds on completion or departure. Windows restores the saved normal placement after session resizing/maximization; Windows 11 top/bottom Snap still needs interactive verification.
- Preserve custom capture order across email-mode and optional-header toggles, saving, and JSON transfers. Disabled fields stay out of active sessions.
- Compact the session heading and collapse guidance into Session options. Manual entry is directly beneath the heading.
- Balance status-notice padding and add space before template import/export controls.
- Update bundles retain verified updater signatures. Publisher signing remains pending.
- Version 0.5.x and later can use Update app. Earlier versions need a manual download.

| Platform                | Download                                |
| ----------------------- | --------------------------------------- |
| macOS 12+ Apple Silicon | `VeraFlow_v0.6.2_macos-arm64.zip`       |
| macOS 12+ Intel         | `VeraFlow_v0.6.2_macos-x64.zip`         |
| Windows x64             | `VeraFlow_v0.6.2_windows-x64-setup.exe` |

On macOS, extract the archive and move VeraFlow.app to Applications. These builds are not Developer ID signed or notarized. macOS may require per-app approval through System Settings → Privacy & Security → Open Anyway. Grant Accessibility permission for source-text capture. On Windows, run the installer; expect an unrecognized-publisher warning. WebView2 may be installed if absent. Only approve a download you trust; do not disable system-wide security protections.

Verify your chosen asset against `SHA256SUMS.txt` using `shasum -a 256 <file>` on macOS or `Get-FileHash <file> -Algorithm SHA256` in PowerShell. Node.js and Rust are not needed to run the app.

Automated checks cover frontend workflows and native compilation. Cross-app clipboard restoration, permission behavior, Intel runtime execution, Windows interactive acceptance, and assistive-technology testing are not fully validated. Use synthetic data while evaluating the preview. Clipboard restoration is best effort; sessions remain only in memory.

The first launch writes a clipboard-preference migration marker that older binaries reject. Downgrade only with a compatible pre-upgrade library backup. Before upgrading, quit VeraFlow and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Older libraries load normally, but binaries before 0.5.0 reject new shortcut preferences and placeholder-style properties. Restore your pre-upgrade library backup when downgrading. Downgrading to 0.2.0 requires its pre-upgrade backup because it rejects the added verification-background preference. Keep your previous binary for rollback. Quitting discards session values.

In email mode, prepare output, focus the first included section in the destination, and press the configured finish shortcut (default Cmd/Ctrl+Shift+8) for each section. It pastes and presses Tab through the configured section order, ending at Body; Body has no trailing Tab. The previous shortcut (Cmd/Ctrl+Shift+2) sends Shift+Tab. The destination must have the matching field order. Going back does not undo text; select existing content before repasting. Output replaces the clipboard, cannot confirm the destination accepted it, and never sends the email. Return to VeraFlow and press Cmd/Ctrl+Enter to finish after reviewing the Body. Real email-client acceptance remains a manual preview gate.

Update bundles are signed with VeraFlow’s update key, including an authenticated version. They are separate from publisher signing: macOS apps are still not Developer ID signed/notarized, and Windows installers still lack an Authenticode publisher certificate. Windows 11 and Intel macOS interactive updater acceptance remains outstanding; automated checks do not establish it.
