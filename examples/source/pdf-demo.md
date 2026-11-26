# Save a PDF from JSON on macOS

English · [简体中文](pdf-demo.zh-CN.md)

## Set up PDF export

Install Pandoc and a TeX distribution with XeLaTeX and Pandoc's required LaTeX packages. The sample forms use **Arial Unicode MS** for Chinese text. If that font is unavailable, use a copy of the form and replace `mainfont` with an installed font that covers the same characters. [Pandoc PDF requirements](https://pandoc.org/MANUAL.html#creating-a-pdf)

On the first PDF save, VeraFlow looks in common locations, including `/opt/homebrew/bin`, `/usr/local/bin`, and `/Library/TeX/texbin`. Use **Locate Pandoc…** and **Locate PDF Engine…** if a path is missing. Select the `xelatex` executable itself, including the `xelatex` link provided by MacTeX. Choose **Use these tools** to remember the paths. Change them later from **Settings → PDF setup**.

## Try the fictional résumé

1. From Home, choose **Open JSON / JSON5…** and open [resume-pdf.json](resume-pdf.json).
2. Choose **Use a form file…** and open [resume-pdf.vf](resume-pdf.vf). Review the changes and select **Apply all changes**.
3. Choose **Prepare output sections** and **Save as PDF…**. Review the complete Markdown, then choose a PDF destination. You can also choose **Save Markdown…** to keep the editable output.
4. Open the PDF and check the name and contact links on page one, including 林晓 and the Chinese bullet under Experience. Skills and Selected Projects start on page two.
5. Import the data again and choose **resume-pdf.vf** under **Recently used form files**. VeraFlow reads the current file from disk each time.

For a separate document, open [dispatch-record.json5](dispatch-record.json5) with [dispatch-report.vf](dispatch-report.vf). The PDF should show dispatch reference `000184` and both sentences from the note.

Use forms and imported text you trust. Markdown and raw LaTeX are part of the document, and the converter can read resources available on your Mac. VeraFlow runs the converter offline, disables LaTeX shell escape, and confines converter writes to its temporary working folder. If conversion fails, the prepared output remains available. [Pandoc security guidance](https://pandoc.org/MANUAL.html#a-note-on-security)

## Run from the command line

From the VeraFlow source checkout, run `npm ci` and build the macOS PDF helper once with `cargo build --manifest-path src-tauri/Cargo.toml --example pdf_cli`. The CLI looks for locally installed Pandoc and XeLaTeX. For custom locations, select the tools in **Settings → PDF setup** in the regular VeraFlow Desktop app. The command reads those settings without opening a window.

```sh
./scripts/veraflow pdf examples/source/resume-pdf.json examples/source/resume-pdf.vf --output "Résumé.pdf"
```

With no `--output`, VeraFlow saves the PDF beside the record using its name. Use `--force` to replace an existing PDF. With piped input, supply a destination.

```sh
cat examples/source/dispatch-record.json5 | ./scripts/veraflow pdf - examples/source/dispatch-report.vf --output "Dispatch.pdf"
```

Use `render` instead of `pdf` to write the prepared Markdown to stdout without Pandoc or XeLaTeX. Use `--output-id` when a form has several named outputs and no `defaultOutput`. If a field needs verification, check it in Desktop, save the prefilled form, and use that file with the same record values.
