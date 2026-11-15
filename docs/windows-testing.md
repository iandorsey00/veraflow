# Windows test builds

For section paste and source documents, use the [source preview download and testing guide](source-preview.md). For the public branch’s current source, open the [main branch Check runs](https://github.com/iandorsey00/veraflow/actions/workflows/check.yml?query=branch%3Amain). For an earlier trial, use that branch’s README to open its Check runs. GitHub Releases hosts the public VeraFlow downloads. Each trial branch packages its own **VeraFlow Test** installer as an Actions artifact.

1. Sign in to GitHub and open a successful **Check** run for the branch you want. Confirm the branch beside the run title.
2. In **Artifacts** on the run summary, download `VeraFlow-Windows-Test-<commit>`. Artifacts are available for 14 days after upload. If the download has expired, select **Run workflow** on the Check workflow page, choose the branch you want, and wait for the new run to succeed. A repository member with write access can start the run.
3. Extract the ZIP. `BUILD.txt` identifies the source commit. To check the installer, compare its PowerShell `Get-FileHash <installer> -Algorithm SHA256` result with `SHA256.txt`.
4. Quit any running VeraFlow or VeraFlow Test instance from the system tray so it releases the global shortcuts. Run `VeraFlow-Test-<commit>-setup.exe`, then launch **VeraFlow Test** from Start. These installers are publisher unsigned.

VeraFlow Test uses its own library and app identity (`com.veraflow.test`). Both trial branches share that Test installation and library. To switch trials, quit VeraFlow Test and run the other branch’s installer. The banner shows the build commit. To upgrade a trial, download and install a newer artifact manually.

GitHub checks cover compilation and automated tests. Try capture, paste, and keyboard shortcuts with the Windows apps you use.

## Historical Windows acceptance notes

Test the new build with synthetic travel/logistics rows: create a folder and table; toggle row titles; add table and row external IDs; capture and save a row, quit/reopen, and confirm saved values remain but must be verified again. Cancel edits and confirm unsaved values are lost only after the explicit erase choice. Save Free Scanner to both a new table and an existing table; check added columns leave other rows intact. Export/import field-only Scanner JSON, value-inclusive Scanner JSON, one table, and the database; import the same file again and confirm independent copies instead of overwrites. Verify JSON before sharing because it includes saved values.

At narrow width, capture a long address and unbroken reference. Check wrapping without horizontal scrolling, bottom field actions, Tab/Shift+Tab boundary escape, Ctrl+C focused-field verification, and ordinary text-selection copying. Focus a target field in another app, click Paste field to last app, and inspect the destination. Repeat with clipboard busy, source window closed, mouse mode off, and elevated targets. Confirm no paste advances the Scanner on failure and no Send occurs. Check matched/missing template labels, Add missing fields, fieldless reusable copy text, and new-library versus old-library migration.

For 0.7.0, also check a CSV UTF-8 export from the actual logistics/travel spreadsheet: quoted addresses, leading-zero booking references, header checkbox override, semicolon/tab detection and formula-looking text. Check 300px and 360px Scanner widths, More tools open, template-only field setup and spaced placeholders in both ordinary/email templates.

For 0.7.1, add extra Scanner names to ordinary and email templates, capture/verify them, and confirm output omits extras. Test Open fields in Scanner and Clear fields and close, including quit/update guards before the choice. Export template JSON and confirm definitions round-trip without captured values. Back up the library first; 0.7.0 cannot load saved extraFields metadata.

For 0.7.2, verify long Scanner values and mismatch/inspection text at 300px and 360px on Windows 11 WebView, including tabs and trailing spaces. Confirm no horizontal scrollbar appears. Export one edited template, confirm it does not save the draft, then import it as a fresh copy; a whole-library file belongs in Import JSON.

For 0.7.3, test repeated session start/completion/cancel at 100/125/150/200% scaling and across mixed-DPI monitors. Confirm the pre-session normal size is restored without cumulative growth, including top/bottom Snap. Drag dotted handles in capture/email/Scanner lists, check arrows by keyboard, and confirm external file drops do not import. Check the update action in navigation and at the Settings heading.

For 0.7.4, focus session fields and paste with Ctrl+V in capture/verification mode for Scanner, ordinary and email templates. Check native paste in editable inputs remains unchanged; test selected/all-filled reverification including mismatches and empty fields. Confirm Scanner reorder controls start hidden and toggle on/off without losing values or verification.

For 0.8.1, create titled snippets in a table and Unfiled. Select a card and press Ctrl+C to transfer literal text to the clipboard; use the mouse Transfer to clipboard button too. Test text-box paste, moving/editing, table deletion unfiling snippets, restart persistence, snippet/table/database JSON and ID remapping. For direct paste, focus an external app’s text field, return, and choose Paste to last app; verify no Tab or Send, modifier-release waiting and source-window-loss errors. Back up first; 0.7.4 cannot read saved snippet metadata.
