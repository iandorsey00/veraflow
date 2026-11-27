# VeraFlow 核流

[English](README.md) · 简体中文

VeraFlow 是一款适用于 macOS 和 Windows 的本地工具。用同一张表单收集、核对信息，再用同一份记录生成邮件、工单或电子表格行。应用无需注册账号，也不使用分析追踪或 AI 服务。应用会访问 GitHub 检查并下载更新。

**来源 → 工作记录 → 命名输出 → 目标**

| 现有资料                                  | 使用方式                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| 手动输入的值、选中的文字或 UTF-8 文本文件 | 直接填写或采集，也可从带标签的文本行提取候选值并审阅。                                   |
| CSV、扁平 JSON 或 JSON5、JSON 候选文件    | 选择 CSV 行、用 JSON 打开预填表单，或核对候选值及其证据。                                |
| XML、YAML 或嵌套 JSON                     | 用外部工具将所需字段转换成扁平 JSON 或 CSV。需人工审阅歧义或证据时，使用 JSON 候选文件。 |
| 已核对的工作记录                          | 生成命名输出，复制或粘贴区段，保存文本或 JSON 记录，也可追加一行到 CSV。                 |

JSON 是记录交换格式。直接填写表单时，工作记录保存在内存中。导入扁平记录及编写 `.veraflow` 或 `.vf` 文件头时均可使用 JSON5。记录导出及候选文件使用严格 JSON。[导入和输出指南](docs/veraflow-language-draft.zh-CN.md#工作记录与外部转换工具)

## 安装

从 [v0.25.0 预览版发布页](https://github.com/iandorsey00/veraflow/releases/tag/v0.25.0) 下载适合你的安装包。使用发布页上的 `SHA256SUMS.txt` 核对下载文件。直接使用安装包不需要安装 Node.js 或 Rust。

- **macOS 12 或更新版本**：Apple 芯片选 `macos-arm64.zip`，Intel 芯片选 `macos-x64.zip`。解压后将 VeraFlow.app 移到「应用程序」。预览版尚无 Developer ID 签名和 Apple 公证。如果系统拦截且你信任下载来源，可在「隐私与安全性」中为该应用选择「仍要打开」。跨应用采集和粘贴需要「辅助功能」权限。
- **Windows**：运行 `windows-x64-setup.exe`。Windows 可能提示发布者未知。如果系统缺少 WebView2，安装程序可能会安装它。

在 **设置 → 语言** 选择 **简体中文**，然后点击 **保存设置**。应用可从设置或托盘菜单检查更新。

## 打开表单或文件夹

- **打开文件…** 支持 `.veraflow`、`.vf` 和 CSV。安装桌面版后，也可从 Finder 或文件资源管理器打开模板。选择一条 CSV 记录后，可用模板生成输出，或在自定义表单中核对该记录。
- **打开 JSON / JSON5…** 可粘贴数据或打开文件。审阅字段值后，可用预填表单生成字段摘要、自定义输出，或选择已有表单文件。[试用 JSON 演示](examples/source/json-demo.zh-CN.md)。
- 模板可以[关联 CSV](docs/veraflow-language-draft.zh-CN.md#关联-csv) 并直接打开输出页面。可选择记录和命名输出，也可用箭头依次查看组合。
- 选择 **追加行** 可核对并将记录写入 CSV，也可复制一行并粘贴到电子表格。[追加行指南](docs/veraflow-language-draft.zh-CN.md#追加行)
- 打开[片段集合](docs/veraflow-language-draft.zh-CN.md#片段集合)可一键复制常用文字。片段集合可与一个文件表单及一个自定义表单同时打开。
- **打开文件夹…** 查找该文件夹及子文件夹中的模板。文件夹由 Finder 或文件资源管理器管理。外部改动后点击 **刷新**。
- 用 **创建表单** 可临时定义字段或导入字段列表。在 **表单工具** 中可设置默认核对规则并导出字段或字段及其值。旧版模板可从 **设置 → 旧版模板库** 打开。

最简单的模板只需写 `你好，{{姓名}}！`。共享记录、命名输出、来源比较和粘贴区段的用法见[模板语言指南](docs/veraflow-language-draft.zh-CN.md)。可以先试用[示例文件](examples/source/README.zh-CN.md)，再安装[适用于 VS Code 的扩展](editors/vscode/README.zh-CN.md)。兼容旧版归档时，可参阅[便携模板规则](docs/portable-templates.zh-CN.md)。

## 填写、核对和输出

在源文件表单中，**从来源提取…** 可一次获取整段文本。**表单工具** 中有记录导入和导出、来源比较与 CSV 操作。顶部的 **待处理** 显示未填写和待核对的数量。

在[发货跟进示例](examples/source/shipment-steps.veraflow)中，可分步骤填写表单，并在多个输出中沿用已核对的值。

1. 在表单中输入或粘贴，也可在其他应用中选中文字，再点击字段旁的 **采集**。布尔值和其他选项直接在 VeraFlow 中选择。
2. 选择 **核对字段**，再选择或输入原文。两次内容不一致时，应用会显示差异并保留已有值。通过 **待处理** 或按 **Alt+Shift+N**（macOS 上为 **Option+Shift+N**）跳转到待填写或待核对的字段。
3. 查看实时预览，点击 **准备输出区段**。你可以复制当前区段、保存文本，或按窗口显示的快捷键粘贴。**粘贴选项 → 调整区段顺序…** 只调整本次会话的粘贴顺序。自定义顺序每次只粘贴一个区段，也不会发送 Tab 等导航按键。
4. **最近的输出** 保存已准备好的结果，方便重新复制。关闭时可选择 **保存到最近打开的表单**，以后从启动页继续填写，也可 **保存预填表单** 文件。

Windows 默认输出快捷键为 **Ctrl+Alt+X**，macOS 为 **Cmd+Opt+X**。其他操作使用 Ctrl+Alt+1–7 或 Cmd+Opt+1–7。升级时会保留已有的快捷键设置。可在设置中修改。部分受保护的应用会拦截模拟按键，此时可手动复制和粘贴。

可在设置中启用 **会话窗口置顶**，在其他应用中工作时仍能看到表单。暂停回到首页时会解除置顶。[五分钟住房申请演示](examples/source/housing-demo.zh-CN.md)。发布页提供 `VeraFlow_Demo.zip`。[显示器换货演示](examples/source/service-demo.zh-CN.md)介绍批量提取、候选值审阅和字段核对。

在 macOS 上，**另存为 PDF…** 可先审阅 Markdown，再使用已安装的 Pandoc 与 XeLaTeX 在本地转换。也可保存可编辑的 Markdown。[设置步骤与虚构简历演示](examples/source/pdf-demo.zh-CN.md) · [命令行用法](examples/source/pdf-demo.zh-CN.md#在命令行中运行)

可用 [VeraFlow 命令行](docs/cli.zh-CN.md) 检查表单、校验和合并记录、审阅提取证据，并通过脚本或 AI 工具生成输出。

## 本地数据与源码

已保存的表单、准备好的结果和预填文件以明文保存。可在启动页清除最近打开的表单，也可在设置中调整或清空最近输出。升级前请退出应用并备份 `library.json`。macOS 数据目录是 `~/Library/Application Support/com.veraflow.desktop/`，Windows 是 `%APPDATA%\com.veraflow.desktop\`。

从源码运行需要 Node.js 22.12+、稳定版 Rust 和 [Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)：

```sh
npm ci
npm run desktop
```

`npm run dev` 启动浏览器预览。原生跨应用采集和粘贴需要桌面版。测试版使用独立的本地库，请按[测试版指南](docs/source-preview.zh-CN.md)安装和试用。

VeraFlow © 2026 Ian Dorsey。按 [MIT 许可证](LICENSE)开源。[GitHub 源码](https://github.com/iandorsey00/veraflow)
