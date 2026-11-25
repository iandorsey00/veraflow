# VeraFlow 的 VS Code 扩展

[English](README.md) · 简体中文

文件头支持 JSON5 注释、单引号和未加引号的键的语法高亮。文件头代码片段也兼容严格 JSON。

从 [GitHub 发布页](https://github.com/iandorsey00/veraflow/releases)下载 `VeraFlow_VSCode.vsix`。独立测试版的文件名为 `VeraFlow-VSCode.vsix`。在 VS Code 中选择 **扩展 → … → 从 VSIX 安装…**。打开 `.veraflow` 或 `.vf` 文件即可使用语法高亮、折叠、括号匹配和自动配对。输入 `vf-` 并按 Ctrl+Space 查找代码片段，也可在命令面板中使用 **插入代码片段**。展开代码片段后，用 Tab 跳到下一处。

## 跳过自动补齐的右括号

在设置中搜索 `@id:editor.autoClosingOvertype`。选择 **auto**，输入右括号时会跳过编辑器自动插入的配对字符。**always** 也允许跳过已有的配对字符。若只想对 VeraFlow 文件启用，请打开命令面板，执行 **Preferences: Open User Settings (JSON)**，然后合并以下配置：

```json
{
  "[veraflow]": {
    "editor.autoClosingBrackets": "languageDefined",
    "editor.autoClosingOvertype": "auto"
  }
}
```

光标位于自动补齐的 `}}` 前时，可键入右括号尝试跳过。也可直接按两次右方向键。

可在扩展源码目录运行 `npx @vscode/vsce@3.6.0 package` 生成 VSIX。[模板语言指南](https://github.com/iandorsey00/veraflow/blob/main/docs/veraflow-language-draft.zh-CN.md)
