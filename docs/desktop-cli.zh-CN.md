# 在桌面端 CLI 与 VeraFlow Web 之间交换记录

[English](desktop-cli.md)

本教程使用虚构的派送记录、可复用表单及 VeraFlow Desktop 0.25.0。请在 VeraFlow Web 仓库目录中运行命令，并将桌面端仓库放在同一级目录。首次使用 CLI 前，请在桌面端仓库运行一次 `npm ci`。[派送表单](../examples/dispatch-exchange.vf) · [来源文本](../examples/dispatch-exchange.txt) · [桌面端 CLI 指南](https://github.com/iandorsey00/veraflow/blob/d2bac40/docs/cli.zh-CN.md)

## 查看表单并生成候选值

```sh
../veraflow/scripts/veraflow inspect examples/dispatch-exchange.vf
../veraflow/scripts/veraflow fields examples/dispatch-exchange.vf > dispatch-fields.json
../veraflow/scripts/veraflow extract examples/dispatch-exchange.txt \
  examples/dispatch-exchange.vf > dispatch-candidates.json
```

查找字段 ID `reference`、`route`、`tracking` 和 `delivery_code`。Route 的选项 **Ground** 和 **Air** 分别对应选项 ID `ground` 和 `air`。默认输出为列表中的第二项 `log`。外部提取工具可以用 `dispatch-fields.json` 和来源文本生成候选值 JSON。在 Web 中也可通过“从来源提取… → 外部提取文件 → 导出字段说明…”导出同样的字段定义。

## 在 Web 中审阅

1. 在 VeraFlow Web 中打开同一个 `dispatch-exchange.vf`，下载 HTML 表单，再用浏览器直接打开文件。初始选中的输出是 **Dispatch log**。
2. 选择“从来源提取…”，载入原始文本。然后通过“外部提取文件 → 导入候选值…”打开 `dispatch-candidates.json`。审阅建议值 `000184` 及其引文 `Reference: 000184`，确认 Route 的建议值为 `ground`，再应用所选值。与当前值一致的候选项可保持原样。
3. 如需同时测试未回答与明确的空字符串，选择“表单工具 → 打开 JSON / JSON5…”，粘贴 `{route: "ground", tracking: null, delivery_code: ""}`。对比后应用。这里显式提供 Route，下载回答时才会写入它的选项 ID。
4. 候选值审阅用于核对支持建议值的证据。练习字段核对时，展开“选填项”并输入一个物流单号，再用“核对字段”与从独立来源读取的值比对。继续前，通过 JSON 导入审阅将 `tracking` 恢复为 `null`。
5. 选择“表单工具 → 下载回答 JSON”，将文件另存为当前目录中的 `responses.json`。生成默认输出 **Dispatch log**，点击“下载输出 JSON”，另存为 `log.json`。

## 验证并生成已接受记录的输出

```sh
../veraflow/scripts/veraflow validate examples/dispatch-exchange.vf \
  --record responses.json
../veraflow/scripts/veraflow render responses.json examples/dispatch-exchange.vf \
  --format json > desktop-log.json
```

两个输出文件都使用 `veraflow-render` 第 1 版结构，输出 ID 为 `log`，段落 ID 为 `body`，段落文本都以 `000184 | Ground service` 开头。回答文件按准确的字段 ID 保留 `"000184"`、`"ground"`、`null` 和 `""`。如需比较 **Dispatch note**，请在 Web 中选择该输出，并在桌面命令后加上 `--output-id note`。该输出的段落顺序为 `subject`、`body`。

如需在桌面界面重新打开回答，请打开同一表单并选择“表单工具 → 导入 JSON / JSON5…”。若表单要求核对后才能生成输出，请在桌面端完成核对，再保存包含核对状态的预填表单。若需完全一致的 Helvetica 简历 PDF 排版，请使用 macOS 桌面端或 CLI 的 PDF 流程。[简历 PDF 教程](https://github.com/iandorsey00/veraflow/blob/d2bac40/examples/source/pdf-demo.zh-CN.md)
