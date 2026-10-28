VeraFlow 核流 0.7.3 is a **publisher-unsigned preview** improving field ordering, update placement and Windows window restoration.

- Drag dotted handles to reorder template capture fields, email headers, and Scanner fields. Arrow buttons remain available; email Body stays last.
- Scanner values, verification and the active field stay attached when reordered. Its order is session-local; saved tables retain their column order.
- Update now appears in the main navigation when available. Settings has its update action beside the heading.
- Windows placement uses consistent DPI coordinates to avoid size growth after sessions. Repeated high-DPI/Snap acceptance on real Windows 11 remains a manual check; macOS placement is unchanged.
- Includes the compatible Tokio 1.53.3 safety patch.

Download the Windows x64 installer or macOS arm64/x64 ZIP. Node.js and Rust are not needed. Verify downloads against SHA256SUMS.txt. The signed updater remains available. Quit via the tray and back up library.json before upgrading; 0.7.2 uses the same schema.

Updater signatures are mandatory; Apple Developer ID/notarization and Windows Authenticode signing remain unconfigured. Cross-app paste/focus, permissions, Snap layouts and actual in-place update/relaunch remain manual acceptance checks.
