# VeraFlow for VS Code

English · [简体中文](README.zh-CN.md)

The header highlighter recognizes JSON5 comments, single quotes, and unquoted keys. The included header snippets also work as strict JSON.

Open a `.veraflow` or `.vf` file in Visual Studio Code for syntax highlighting, collapsible headers and blocks, bracket matching, and paired braces. Type `vf-` and press **Ctrl+Space** to see snippets for headers, fields, output sections, and conditions. You can also find them with **Insert Snippet** from the Command Palette.

Download `VeraFlow_VSCode.vsix` from a public release that includes the extension, or `VeraFlow-VSCode.vsix` from the matching source preview. Install it with **Extensions → … → Install from VSIX…**. To build it from this directory, run `npx @vscode/vsce@3.6.0 package`. [Releases](https://github.com/iandorsey00/veraflow/releases)

After VS Code inserts the closing `}}`, press Right Arrow twice to move outside the pair. Typing the closing characters can also move over the auto-inserted pair when VS Code's auto-closing overtype is enabled. When expanding a snippet, use Tab to move through its fields and out of the snippet.

Search Settings for `@id:editor.autoClosingOvertype` and choose `auto` for automatically inserted closers, or `always` to also type over existing matching closers. To apply the setting only to VeraFlow files, run **Preferences: Open User Settings (JSON)** and merge this block into your settings:

```json
{
  "[veraflow]": {
    "editor.autoClosingBrackets": "languageDefined",
    "editor.autoClosingOvertype": "auto"
  }
}
```

See the [VeraFlow language guide](https://github.com/iandorsey00/veraflow/blob/main/docs/veraflow-language-draft.md) for template syntax.
