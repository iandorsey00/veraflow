# 试用 VeraFlow Test

[English](source-preview.md) · 简体中文

在 [GitHub 发布页](https://github.com/iandorsey00/veraflow/releases)选择 `preview-source.*` 测试版本。**VeraFlow Test** 使用独立的本地库。升级测试版时，手动下载较新的安装包。启动测试版前请退出其他正在运行的 VeraFlow 实例，以释放全局快捷键。

- **Windows 11**：下载并运行 `VeraFlow-Test-windows-x64-setup.exe`，然后从开始菜单打开 **VeraFlow Test**。系统可能提示发布者未知。右键点击模板或 CSV，选择 **打开方式 → VeraFlow Test**。
- **macOS**：Apple 芯片下载 `VeraFlow-Test-macos-arm64.zip`，Intel 芯片下载 `VeraFlow-Test-macos-x64.zip`。解压后将 **VeraFlow Test.app** 移到「应用程序」。如果系统拦截且你信任下载来源，可在「隐私与安全性」中为该应用选择「仍要打开」。跨应用快捷键需要「辅助功能」权限。

可将下载文件的 SHA-256 值与 `SHA256SUMS.txt` 核对。Windows 用 `Get-FileHash <文件路径> -Algorithm SHA256`，macOS 用 `shasum -a 256 <文件路径>`。

## 试用模板及扩展

1. 解压测试发布页中的 `VeraFlow-examples.zip`，用 **打开文件夹…** 选择解压后的目录。
2. 在浏览器打开 `test-destination.html`，在 VeraFlow Test 打开 `step-tabs.veraflow`，点击 **准备输出区段**。
3. 在测试页中点击 Recipient。Windows 按 Ctrl+Alt+8，macOS 按 Cmd+Option+8。再按两次，分别填入主题和正文。尝试 `full-sequence.veraflow`，一次填完三个字段。
4. 用[示例说明](../examples/source/README.zh-CN.md)试用 CSV、行内条件及预填模板。粘贴中途失败时，先检查目标应用，再重试。可手动复制当前区段。
5. 下载 `VeraFlow-VSCode.vsix`，按 [VS Code 扩展指南](../editors/vscode/README.zh-CN.md)安装。

源码构建需要 Node.js、Rust 和 Tauri 构建依赖。测试分支可用 `npm ci` 和 `npm run desktop -- --features test-build --config src-tauri/tauri.test.conf.json` 启动。测试版的具体功能随所选版本而异。
