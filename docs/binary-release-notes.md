VeraFlow 核流 0.7.1 is a **publisher-unsigned preview** adding extra Scanner fields to templates and email mode.

- In the template editor, use **Extra Scanner fields** to list names one per line. Spaces are supported; blank lines and duplicate names are ignored. Names shared with placeholders are captured once.
- Capture and verify these fields alongside the ordinary template fields. They never appear in rendered text or email headers/Body unless you explicitly use the same name as a placeholder.
- After copying an ordinary template with extras or finishing email output, choose **Open fields in Scanner** or **Clear fields and close**. Values stay in memory and quit/update guards remain active until you choose. Existing ordinary-template completion is unchanged when no extras are defined.
- Extra field definitions round-trip through saved templates and template JSON. Captured values/candidates are not included. Scanner can separately transfer/export values or explicitly save them to a row.

Download the Windows x64 installer or the macOS arm64/x64 ZIP for your machine. Verify against `SHA256SUMS.txt`. Node.js and Rust are not needed. Public app updates are available through the existing signed updater; VeraFlow Test uses a separate library and cannot install public updates.

Before upgrading, quit via the tray and back up `library.json`. Versions 0.7.0 and earlier reject the new `extraFields` property, so rollback requires a compatible pre-upgrade backup. Existing templates without extras load unchanged. Saved rows remain local plaintext until explicitly deleted.

Updater packages retain mandatory signatures and authenticated versions. Apple Developer ID/notarization and Windows Authenticode publisher signing remain unconfigured. Preview labeling and existing system approval requirements remain. Native cross-app paste/focus, permissions, Intel runtime, Snap layouts and actual in-place update/relaunch acceptance are not established by automated packaging checks. No Send operation is emitted.
