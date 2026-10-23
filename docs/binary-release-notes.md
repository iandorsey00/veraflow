VeraFlow 核流 0.7.2 is a **publisher-unsigned preview** with narrow-window verification layout improvements and individual template sharing.

- Field values, expanded inspection, and mismatch comparisons wrap within the available width. Narrow fields place their status below the value.
- **Export this template** exports the selected template’s current edits without saving them. **Import one template** accepts a single-template JSON file and adds a fresh copy after confirmation.
- Existing **Import JSON / Export JSON** still exchange the whole template library. Files contain definitions, including email settings and extra Scanner fields, but never captured session values.

Download the Windows x64 installer or the macOS arm64/x64 ZIP. Node.js and Rust are not needed. Verify downloads against SHA256SUMS.txt. The signed updater remains available. Quit via the tray and back up library.json before upgrading; 0.7.1 uses the same schema.

Updater signatures are mandatory; Apple Developer ID/notarization and Windows Authenticode signing remain unconfigured. Real Windows WebView wrapping, cross-app paste/focus, permissions, Snap layouts and in-place update/relaunch remain manual acceptance checks.
