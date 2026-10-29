VeraFlow 核流 0.7.4 is a **publisher-unsigned preview** adding direct field paste and reverification while reducing Scanner clutter.

- Focus a session field and press Ctrl+V (Cmd+V on macOS) to capture plain text, or compare it during verification. Text boxes keep normal paste behavior. Replacing a captured value clears its verification.
- **Verify again…** offers the selected field or all filled fields. Captured text is preserved, including on a mismatch; unrelated verification stays unchanged for a selected-field check.
- Scanner hides drag handles and arrows by default. Choose **Reorder fields** to show them and **Done reordering** to hide them. Template capture-order and email paste-order controls remain visible.

Download the Windows x64 installer or macOS arm64/x64 ZIP. Node.js and Rust are not needed. Verify downloads against SHA256SUMS.txt. The signed updater remains available. Quit via the tray and back up library.json before upgrading; 0.7.3 uses the same schema.

Updater signatures are mandatory; Apple Developer ID/notarization and Windows Authenticode signing remain unconfigured. Windows WebView paste, native cross-app focus/paste, scaled-monitor/Snap restoration and actual in-place update/relaunch remain manual acceptance checks.
