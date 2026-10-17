# Windows testing from a Mac

Use test builds for day-to-day Windows feedback, then publish a public release after acceptance. The Check workflow builds a Windows installer for branch changes only after automated checks pass. These are workflow artifacts, not GitHub Releases, and they never update the public feed. Rust dependency caching and cancellation of superseded runs reduce repeated work.

## Download and install

1. Open the repository's [Check runs](https://github.com/iandorsey00/veraflow/actions/workflows/check.yml), select the run for the intended commit, and wait for Windows success.
2. Sign in to GitHub and download the `VeraFlow-Windows-Test-<commit>` artifact from the run's Artifacts section. Artifacts are retained for 14 days. Extract the ZIP.
3. Check the installer with PowerShell `Get-FileHash <installer> -Algorithm SHA256` against the included SHA256.txt. BUILD.txt identifies the exact commit. Install only your intended build; these installers remain publisher unsigned.
4. Install **VeraFlow Test** alongside VeraFlow. Its identifier is `com.veraflow.test`; it uses a separate app-data library and installation name. The test configuration preserves normal window constraints. Export/import template JSON explicitly if needed; captured values never transfer through JSON.
5. Check capture from the Windows apps you use, verification, clipboard output, focus the target before the output shortcut, Paste/Tab field order, failed-paste recovery, template handoff, Return to Scanner, and top/bottom Snap restoration. Test with synthetic data first.
6. Keep the main VeraFlow app closed while testing global shortcuts, since both apps use the same default combinations. A shortcut collision still permits manual capture. Uninstalling the test app does not uninstall the production app; retain or delete its separate data deliberately.

The test app shows a banner. Frontend startup update checks are disabled, and native `test-build` handlers reject both update checking and installation before any network/download operation. Test builds do not use the private updater key. Install a newer test artifact manually. Public VeraFlow and its signed updater remain on v0.6.2 until a release is deliberately tagged.

GitHub-hosted Windows checks validate compilation, core behavior, browser accessibility, and native placement logic. They do not prove cross-app focus, real Outlook behavior, Snap layouts, permission prompts, or keyboard hooks on your desktop. Use the existing Windows machine for those checks; remote access to it from the Mac can reduce switching. A Windows VM is another option if you prefer a local test desktop, but is not required for this workflow.

After Windows acceptance, use the normal full release workflow to package signed updater bundles for all three platforms, verify signatures and downloaded checksums, publish the preview, and update the feed. Keep the current production installer and a library backup for rollback. Fixes to published releases require a higher version.

References: [GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) and [Tauri isolated beta configuration](https://v2.tauri.app/develop/configuration-files/).
