VeraFlow 核流 0.3.1 is the first downloadable **unsigned preview**. It includes the 0.3.0 keyboard workflow, optional green verification background, and template duplication fix.

| Platform                | Download                                |
| ----------------------- | --------------------------------------- |
| macOS 12+ Apple Silicon | `VeraFlow_v0.3.1_macos-arm64.zip`       |
| macOS 12+ Intel         | `VeraFlow_v0.3.1_macos-x64.zip`         |
| Windows x64             | `VeraFlow_v0.3.1_windows-x64-setup.exe` |

On macOS, extract the archive and move VeraFlow.app to Applications. These builds are not Developer ID signed or notarized. macOS may require per-app approval through System Settings → Privacy & Security → Open Anyway. Grant Accessibility permission for source-text capture. On Windows, run the installer; expect an unrecognized-publisher warning. WebView2 may be installed if absent. Only approve a download you trust; do not disable system-wide security protections.

Verify your chosen asset against `SHA256SUMS.txt` using `shasum -a 256 <file>` on macOS or `Get-FileHash <file> -Algorithm SHA256` in PowerShell. Node.js and Rust are not needed to run the app.

Automated checks cover frontend workflows and native compilation. Cross-app clipboard restoration, permission behavior, Intel runtime execution, Windows interactive acceptance, and assistive-technology testing are not fully validated. Use synthetic data while evaluating the preview. Clipboard restoration is best effort; sessions remain only in memory.

Before upgrading, quit VeraFlow and back up `library.json` from `~/Library/Application Support/com.veraflow.desktop/` or `%APPDATA%\com.veraflow.desktop\`. Versions 0.3.0 and 0.3.1 share the same preference schema. Downgrading to 0.2.0 requires its pre-upgrade backup because it rejects the added verification-background preference. Keep your previous binary for rollback. Quitting discards session values.
