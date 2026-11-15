# Test the VeraFlow source preview

Use the assets on the [source prerelease page](https://github.com/iandorsey00/veraflow/releases/tag/preview-source.1). The test app is called **VeraFlow Test**. It has a separate local library and upgrades through a new manual download. Quit any running VeraFlow instance before starting the test app so it releases the global shortcuts.

- **Windows 11**. Download and run `VeraFlow-Test-windows-x64-setup.exe`, then open **VeraFlow Test** from Start. The installer may show an unsigned-publisher warning. In File Explorer, right-click a template or CSV and choose **Open with → VeraFlow Test**. To test double-click, pick VeraFlow Test as the default for `.veraflow` or `.vf`.
- **macOS**. Download `VeraFlow-Test-macos-arm64.zip` on Apple silicon or `VeraFlow-Test-macos-x64.zip` on Intel. Extract it and move **VeraFlow Test.app** to Applications. Use the per-app **Open Anyway** option in Privacy & Security if Gatekeeper blocks the preview and you trust the download. Give VeraFlow Test Accessibility permission there for cross-app shortcuts. Finder’s **Open With** menu can open the examples in the test app.

Compare downloads with `SHA256SUMS.txt` if you want to verify them. Windows uses `Get-FileHash <download> -Algorithm SHA256`. macOS uses `shasum -a 256 <download>`.

## Try the examples

1. Extract `VeraFlow-examples.zip`. The [examples README](https://github.com/iandorsey00/veraflow/tree/codex/source-preview/examples/source#readme) lists the expected results.
2. Open `test-destination.html` in your browser and `step-tabs.veraflow` in VeraFlow Test. Choose **Prepare output sections**.
3. Click **Recipient** in the browser and press **Ctrl+Alt+8** on Windows or **Cmd+Alt+8** on macOS. Recipient fills and focus moves two Tabs to Subject. Press the shortcut twice more to fill Subject and Body.
4. Repeat with `full-sequence.veraflow`. One shortcut fills all three fields. Use **Paste mode** on the delivery screen to override the template’s default.
5. Try the CSV, address, and prefilled examples. Save a partially filled session, reopen it, and edit the responses.

Check the destination after a partial paste or focus change before resuming. The app keeps the pending section available for manual copy or navigation.

## Install the VS Code extension

Download `VeraFlow-VSCode.vsix` from the same prerelease. In VS Code, choose **Extensions → … → Install from VSIX…**, select the file, then open a `.veraflow` or `.vf` example. Type `vf-` and use **Insert Snippet** to find templates for headers, sections, conditionals, and paste navigation.

Extension source lives in [editors/vscode](https://github.com/iandorsey00/veraflow/tree/codex/source-preview/editors/vscode). To build it locally, enter that directory and run `npx @vscode/vsce@3.6.0 package`.

## Run from source

Check out [codex/source-preview](https://github.com/iandorsey00/veraflow/tree/codex/source-preview). With Node, Rust, and Tauri build prerequisites installed, run `npm ci` and `npm run desktop -- --features test-build --config src-tauri/tauri.test.conf.json`. On macOS you can also pass `--config src-tauri/tauri.macos.test.conf.json` when bundling an app for testing file associations. The desktop bundle is needed for Finder and Explorer integration. Browser-only preview is available with `npm run dev`.

For later test builds from this branch, see the [branch’s Check runs](https://github.com/iandorsey00/veraflow/actions/workflows/check.yml?query=branch%3Acodex%2Fsource-preview) and [Windows artifact instructions](https://github.com/iandorsey00/veraflow/blob/codex/source-preview/docs/windows-testing.md).
