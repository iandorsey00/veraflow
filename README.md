# VeraFlow 核流

English · [简体中文](README.zh-CN.md)

VeraFlow is a local desktop app for capturing, checking, and reusing text on macOS and Windows. Keep reusable templates in ordinary folders, fill them by typing or with Scanner, and review the result before copying or pasting it. VeraFlow has no account, analytics, or AI service. It contacts GitHub for update checks and downloads.

## Install

Get the [v0.12.0 preview binaries](https://github.com/iandorsey00/veraflow/releases/tag/v0.12.0): macOS Apple Silicon (`macos-arm64.zip`), macOS Intel (`macos-x64.zip`), or Windows x64 (`windows-x64-setup.exe`). Compare downloads with the release’s `SHA256SUMS.txt`. Node.js and Rust are only needed to build from source.

- **macOS 12+**: Extract the ZIP and move VeraFlow.app to Applications. The preview is not Developer ID signed or notarized. If macOS blocks it and you trust the download, use the per-app **Open Anyway** option in Privacy & Security. Give VeraFlow Accessibility permission for cross-app capture and paste.
- **Windows**: Run the installer. Windows may show an unrecognized-publisher warning, and the installer may install WebView2 if needed.

If an update is available, **Update app…** appears in the menu-bar or tray menu. You can also check from Settings. Back up [your local library](#local-data-and-rollback) before upgrading.

## Open a template or folder

- **Open folder…** lists `.veraflow` and `.vf` files, including files in subfolders. Search by file name or relative path, pick a template, and use **Refresh folder** after editing the collection outside VeraFlow. The folder stays open while you work through sessions. Create and organize folders in Finder or File Explorer.
- **Open file…** opens a template or a CSV directly. You can also double-click a template or use your file manager’s **Open With → VeraFlow**. In the CSV picker, search for a row and open it in Scanner or use it to fill a template.
- **Free Scanner** captures and checks text without a template. Define one field per line or import Scanner JSON. Use **More tools** to export the field list or the captured values. Existing library templates and JSON exchange remain available under **Settings → Legacy template library**.

A template can be as simple as `Hello {{name}}`. The [source file guide](docs/veraflow-language-draft.md) covers fill-in forms, conditional text, clipboard output, and paste sections. The [examples](examples/source/README.md) include an address, a sample CSV, and a page to test paste navigation. The [VS Code extension](editors/vscode/README.md) adds highlighting, folding, and snippets. The release page also includes `VeraFlow_VSCode.vsix`. The [portable specification](docs/portable-templates.md) includes a simpler template profile, fixtures, and an independent Python reader.

## Fill, verify, and transfer

1. Open a template as a fill-in form or in Scanner. Scanner can capture selected text from another app, use text you copied yourself, or accept manual typing and paste.
2. When verification is enabled, select the original text again to compare it with the captured value. VeraFlow keeps both values visible if they differ and does not overwrite the capture. To check a value again, select it and use **Verify again…**.
3. Review the live preview, then prepare the output. Copy or save it, or use the paste shortcut in the intended destination. Use **Paste options → Reorder sections…** when the destination has a different field order. A custom order uses one section per shortcut and sends no navigation keys. When closing from output, you can return to your filled form or Scanner. Save a prefilled copy to resume after quitting. Prepared source output also appears in **Recent outputs** for copying.

Default global shortcuts are Ctrl+Alt+1–8 on Windows and Cmd+Option+1–8 on macOS: capture, previous, next, clear, skip, verify, cancel, and output. Change them in Settings. In VeraFlow, Cmd/Ctrl+Enter submits manual entry, and Alt+Left/Right moves between fields. Some protected apps block synthetic input, so copy and paste manually if direct transfer fails. When a paste fails partway through, inspect the destination before resuming; the pending output stays available to copy.

## Local data and rollback

Settings and the older template library are stored in `library.json` under `~/Library/Application Support/com.veraflow.desktop/` on macOS or `%APPDATA%\com.veraflow.desktop\` on Windows. Quit VeraFlow before backing up or restoring that file. Keep a pre-upgrade backup for a rollback; older versions may reject settings or definitions from this release. Existing saved data is retained in place. Prefilled source files and exported results are plain text and may contain private information.

See [release and rollback instructions](docs/release.md), [release notes](CHANGELOG.md), and [known limitations](docs/binary-release-notes.md).

## Run from source or try a test build

Requirements: Node.js 22.12+, stable Rust, and the [Tauri build prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run desktop
```

Use `npm run dev` for a browser-only preview without native transfer, menu-bar integration, or persistent storage. For isolated **VeraFlow Test** installers, see the [preview guide](docs/source-preview.md) and the `preview-source.*` builds on [Releases](https://github.com/iandorsey00/veraflow/releases). Test builds keep a separate library. [Windows test instructions](docs/windows-testing.md) explain how to try CI artifacts.

VeraFlow © 2026 Ian Dorsey. Open source under the [MIT license](LICENSE). [View the repository on GitHub](https://github.com/iandorsey00/veraflow).
