# Windows testing from a Mac

Use test builds for day-to-day Windows feedback, then publish a public release after acceptance. The Check workflow builds a Windows installer for branch changes only after automated checks pass. You can also use Run workflow on the Check page to request a build without creating a new release. These are workflow artifacts, not GitHub Releases, and they never update the public feed. Rust dependency caching and cancellation of superseded runs reduce repeated work.

## Previous workspace test build

[Download build b0956a56](https://github.com/iandorsey00/veraflow/actions/runs/39539572305/artifacts/12318967250) (GitHub sign-in required). This previous Windows x64 test installer includes the October 20 workspace and Scanner changes, but not October 21 CSV import or the 300px layout, with a separate library and public updates disabled. Extract the ZIP, then run `VeraFlow-Test-b0956a56-setup.exe`. Its source record and checksum are included. The artifact expires after 14 days; future runs produce new downloads. [Check run and logs](https://github.com/iandorsey00/veraflow/actions/runs/39539572305).

Back up the test library before upgrading. Saved rows use the new optional workspace property; older test binaries reject it. Rollback requires restoring a compatible pre-upgrade library. Production VeraFlow's library is separate.

## Download and install

1. Open the repository's [Check runs](https://github.com/iandorsey00/veraflow/actions/workflows/check.yml), select the run for the intended commit, and wait for Windows success.
2. Sign in to GitHub and download the `VeraFlow-Windows-Test-<commit>` artifact from the run's Artifacts section. Artifacts are retained for 14 days. Extract the ZIP.
3. Check the installer with PowerShell `Get-FileHash <installer> -Algorithm SHA256` against the included SHA256.txt. BUILD.txt identifies the exact commit. Install only your intended build; these installers remain publisher unsigned.
4. Install **VeraFlow Test** alongside VeraFlow. Its identifier is `com.veraflow.test`; it uses a separate app-data library and installation name. The test configuration preserves normal window constraints. Export/import template JSON explicitly if needed; captured values never transfer through JSON.
5. Check capture from the Windows apps you use, verification, clipboard output, focus the target before the output shortcut, Paste/Tab field order, failed-paste recovery, template handoff, Return to Scanner, post-email Open fields in Scanner versus Clear fields and close, bottom field actions and the right-click menu, stock Ctrl+Alt shortcut migration, and top/bottom Snap restoration. Test with synthetic data first.
6. Quit regular VeraFlow through its tray menu before testing; closing its window can leave it running. Both apps use the same default shortcut combinations (now Ctrl+Alt+1–8 for stock bindings). A shortcut collision still permits manual capture. Uninstalling the test app does not uninstall the production app; retain or delete its separate data deliberately.

The test app shows a banner. Frontend startup update checks are disabled, and native `test-build` handlers reject both update checking and installation before any network/download operation. Test builds do not use the private updater key. Install a newer test artifact manually. Public VeraFlow 0.7.1 is distributed through the [release page](https://github.com/iandorsey00/veraflow/releases/tag/v0.7.1); test builds remain separate and cannot install public updates.

GitHub-hosted Windows checks validate compilation, core behavior, browser accessibility, and native placement logic. They do not prove cross-app focus, real Outlook behavior, Snap layouts, permission prompts, or keyboard hooks on your desktop. Use the existing Windows machine for those checks; remote access to it from the Mac can reduce switching. A Windows VM is another option if you prefer a local test desktop, but is not required for this workflow.

After Windows acceptance, use the normal full release workflow to package signed updater bundles for all three platforms, verify signatures and downloaded checksums, publish the preview, and update the feed. Keep the current production installer and a library backup for rollback. Fixes to published releases require a higher version.

References: [GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) and [Tauri isolated beta configuration](https://v2.tauri.app/develop/configuration-files/).

The October 19 build adds an optional one-time shortcut migration marker. Back up the test library before upgrading; older test binaries reject the new property. To roll back a test installation, restore its compatible pre-upgrade library backup. Production VeraFlow's separate library is unaffected.

## October 20 workspace acceptance

Test the new build with synthetic travel/logistics rows: create a folder and table; toggle row titles; add table and row external IDs; capture and save a row, quit/reopen, and confirm saved values remain but must be verified again. Cancel edits and confirm unsaved values are lost only after the explicit erase choice. Save Free Scanner to both a new table and an existing table; check added columns leave other rows intact. Export/import field-only Scanner JSON, value-inclusive Scanner JSON, one table, and the database; import the same file again and confirm independent copies instead of overwrites. Verify JSON before sharing because it includes saved values.

At narrow width, capture a long address and unbroken reference. Check wrapping without horizontal scrolling, bottom field actions, Tab/Shift+Tab boundary escape, Ctrl+C focused-field verification, and ordinary text-selection copying. Focus a target field in another app, click Paste field to last app, and inspect the destination. Repeat with clipboard busy, source window closed, mouse mode off, and elevated targets. Confirm no paste advances the Scanner on failure and no Send occurs. Check matched/missing template labels, Add missing fields, fieldless reusable copy text, and new-library versus old-library migration.

For 0.7.0, also check a CSV UTF-8 export from the actual logistics/travel spreadsheet: quoted addresses, leading-zero booking references, header checkbox override, semicolon/tab detection and formula-looking text. Check 300px and 360px Scanner widths, More tools open, template-only field setup and spaced placeholders in both ordinary/email templates.

For 0.7.1, add extra Scanner names to ordinary and email templates, capture/verify them, and confirm output omits extras. Test Open fields in Scanner and Clear fields and close, including quit/update guards before the choice. Export template JSON and confirm definitions round-trip without captured values. Back up the library first; 0.7.0 cannot load saved extraFields metadata.
