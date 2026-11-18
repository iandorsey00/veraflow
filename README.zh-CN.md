# VeraFlow 核流

[English](README.md) · 简体中文

VeraFlow 是一款适用于 macOS 和 Windows 的本地文本工具。用普通文件夹管理模板，通过填写表单或扫描器采集并核对文字，预览结果后再复制或粘贴。应用无需注册账号，也不使用分析追踪或 AI 服务。应用会访问 GitHub 检查并下载更新。

## 安装

从 [v0.13.0 预览版发布页](https://github.com/iandorsey00/veraflow/releases/tag/v0.13.0) 下载适合你的安装包。使用发布页上的 `SHA256SUMS.txt` 核对下载文件。直接使用安装包不需要安装 Node.js 或 Rust。

- **macOS 12 或更新版本**：Apple 芯片选 `macos-arm64.zip`，Intel 芯片选 `macos-x64.zip`。解压后将 VeraFlow.app 移到「应用程序」。预览版尚无 Developer ID 签名和 Apple 公证。如果系统拦截且你信任下载来源，可在「隐私与安全性」中为该应用选择「仍要打开」。跨应用采集和粘贴需要「辅助功能」权限。
- **Windows**：运行 `windows-x64-setup.exe`。Windows 可能提示发布者未知。如果系统缺少 WebView2，安装程序可能会安装它。

在 **设置 → 语言** 选择 **简体中文**，然后点击 **保存设置**。应用可从设置或托盘菜单检查更新。

## 打开模板

- **打开文件…** 支持 `.veraflow`、`.vf` 和 CSV。安装桌面版后，也可从 Finder 或文件资源管理器打开模板。选择一条 CSV 记录后，可用模板生成输出，或在自由扫描器中核对该记录。
- **打开文件夹…** 查找该文件夹及子文件夹中的模板。文件夹由 Finder 或文件资源管理器管理。外部改动后点击 **刷新**。
- **自由扫描器** 适合没有模板的任务。每行定义一个字段，或导入扫描器 JSON。在 **更多工具** 中可导出字段或字段及其值。旧版模板可从 **设置 → 旧版模板库** 打开。

最简单的模板只需写 `你好，{{姓名}}！`。共享记录、命名输出、来源比较和粘贴区段的用法见[模板语言指南](docs/veraflow-language-draft.zh-CN.md)。可以先试用[示例文件](examples/source/README.zh-CN.md)，再安装[适用于 VS Code 的扩展](editors/vscode/README.zh-CN.md)。兼容旧版归档时，可参阅[便携模板规则](docs/portable-templates.zh-CN.md)。

## 填写、核对和输出

1. 选择 **填写表单** 或 **在扫描器中打开**。扫描器可以采集其他应用中选中的文字，也可从剪贴板获取或手动输入。布尔值和其他选项直接在 VeraFlow 中选择。
2. 启用核对时，再次选择或输入原文。两次内容不一致时，应用会显示差异并保留已采集的值。
3. 查看实时预览，点击 **准备输出区段**。你可以复制当前区段、保存文本，或按窗口显示的快捷键粘贴。**粘贴选项 → 调整区段顺序…** 只调整本次会话的粘贴顺序。自定义顺序每次只粘贴一个区段，也不会发送 Tab 等导航按键。
4. **最近的输出** 保存已准备好的结果，方便重新复制。要继续修改字段，关闭前可返回已填写的表单或扫描器，也可以 **保存预填模板**，以后重新打开。

Windows 默认输出快捷键为 **Ctrl+Alt+X**，macOS 为 **Cmd+Opt+X**。其他操作使用 Ctrl+Alt+1–7 或 Cmd+Opt+1–7。升级时会保留已有的快捷键设置。可在设置中修改。部分受保护的应用会拦截模拟按键，此时可手动复制和粘贴。

## 本地数据与源码

准备好的结果和预填文件以明文保存。可在设置中调整或清空最近输出。升级前请退出应用并备份 `library.json`。macOS 数据目录是 `~/Library/Application Support/com.veraflow.desktop/`，Windows 是 `%APPDATA%\com.veraflow.desktop\`。

从源码运行需要 Node.js 22.12+、稳定版 Rust 和 [Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)：

```sh
npm ci
npm run desktop
```

`npm run dev` 启动浏览器预览。原生跨应用采集和粘贴需要桌面版。测试版使用独立的本地库，请按[测试版指南](docs/source-preview.zh-CN.md)安装和试用。

VeraFlow © 2026 Ian Dorsey。按 [MIT 许可证](LICENSE)开源。[GitHub 源码](https://github.com/iandorsey00/veraflow)
