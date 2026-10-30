VeraFlow 核流 0.8.1 is a **publisher-unsigned preview** introducing titled, literal snippets for tables and Unfiled.

- Open a table’s collapsible **Snippets** section, or choose **Unfiled snippets** in the Workspace sidebar. Each snippet has a required title and text; braces and email addresses remain literal, with no field capture/verification session.
- Select a snippet and press **Ctrl+C** (Cmd+C on macOS) to transfer its text to the clipboard, or use the mouse **Transfer to clipboard** button. Text boxes retain normal paste.
- In the desktop app, place the caret in your destination app, return to VeraFlow, then choose **Paste to last app**. It emits no Tab or Send.
- Edit titles/text, move between tables and Unfiled, and exchange snippet JSON. Table exports include their snippets; database exports include all snippets. Imports create independent copies when needed. Deleting a table moves its snippets to Unfiled.

Snippets are local plaintext. Limits: 1,000 snippets, 250-character titles, 1 MB UTF-8 text per snippet, within the existing 16 MB library limit. Review JSON text before sharing. **Back up library.json before upgrading: 0.7.4 and earlier cannot read saved snippet metadata. Restore a compatible pre-upgrade backup to downgrade.**

Download the Windows x64 installer or macOS arm64/x64 ZIP. Node.js and Rust are not needed. Verify downloads against SHA256SUMS.txt. The signed updater remains available. Updater signatures are mandatory; Apple Developer ID/notarization and Windows Authenticode signing remain unconfigured. Native cross-app snippet paste, permissions, real Windows scaling/Snap and in-place update/relaunch remain manual acceptance checks.
