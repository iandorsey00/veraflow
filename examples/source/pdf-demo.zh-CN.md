# 在 macOS 上从 JSON 生成 PDF

[English](pdf-demo.md) · 简体中文

## 首次设置

请安装 Pandoc 和包含 XeLaTeX 及 Pandoc 所需宏包的 TeX 发行版。示例使用 **Arial Unicode MS** 显示中文。如果此字体不可用，可复制示例表单，并将 `mainfont` 改为 Mac 上已安装且支持中文的字体。[Pandoc 的 PDF 依赖](https://pandoc.org/MANUAL.html#creating-a-pdf)

首次保存 PDF 时，VeraFlow 会在 `/opt/homebrew/bin`、`/usr/local/bin` 和 `/Library/TeX/texbin` 等常见位置查找程序。找不到时，点击 **定位 Pandoc…** 或 **定位 PDF 引擎…**。请选择 `xelatex` 本身，也可选择 MacTeX 提供的同名链接。选择 **使用这些工具** 保存路径。以后可在 **设置 → PDF 设置** 中修改。

## 试用虚构简历

1. 在首页选择 **打开 JSON / JSON5…**，打开 [resume-pdf.json](resume-pdf.json)。
2. 选择 **使用表单文件…**，打开 [resume-pdf.vf](resume-pdf.vf)。审阅并点击 **应用所有更改**。
3. 点击 **准备输出区段**，再点击 **另存为 PDF…**。审阅完整的 Markdown 后选择 PDF 的保存位置。若要保留可编辑文本，选择 **保存 Markdown…**。
4. 打开 PDF。第一页应有姓名「林晓」、联系方式链接及工作经历中的中文条目；第二页应有技能和精选项目。
5. 再次导入时，可从 **最近使用的表单文件** 选择 **resume-pdf.vf**。VeraFlow 每次都会从磁盘读取当前文件。

若要试用其他文档，可将 [dispatch-record.json5](dispatch-record.json5) 与 [dispatch-report.vf](dispatch-report.vf) 搭配使用。PDF 应保留派送编号 `000184` 和备注中的两句话。

请使用可信的表单和导入内容。Markdown 和原始 LaTeX 是文档的一部分，转换工具可以读取 Mac 上可用的资源。VeraFlow 让转换工具离线运行，关闭 LaTeX 的 shell escape，并将写入限制在临时工作目录中。转换失败后，仍可查看或保存已准备的内容。[Pandoc 安全说明](https://pandoc.org/MANUAL.html#a-note-on-security)

## 在命令行中运行

在 VeraFlow 源码目录中运行 `npm ci`，再运行 `cargo build --manifest-path src-tauri/Cargo.toml --example pdf_cli`，构建一次 macOS PDF 辅助程序。命令会查找本机安装的 Pandoc 和 XeLaTeX。如需指定其他路径，请在常规版 VeraFlow 的 **设置 → PDF 设置** 中选择工具。运行命令时会读取这些设置，无需启动桌面窗口。

```sh
./scripts/veraflow pdf examples/source/resume-pdf.json examples/source/resume-pdf.vf --output "简历.pdf"
```

省略 `--output` 时，PDF 会保存到记录所在目录，并沿用记录的文件名。只有指定 `--force` 才能覆盖已有的 PDF。从管道读取时，需要提供输出路径。

```sh
cat examples/source/dispatch-record.json5 | ./scripts/veraflow pdf - examples/source/dispatch-report.vf --output "派送单.pdf"
```

将 `pdf` 换成 `render`，可直接将准备好的 Markdown 输出到标准输出，无需 Pandoc 或 XeLaTeX。表单包含多个命名输出且未设置 `defaultOutput` 时，请使用 `--output-id`。如果字段需要核对，请先在桌面版完成核对并保存预填表单，再使用该表单和相同的数据运行命令。
