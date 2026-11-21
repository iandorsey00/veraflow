# VeraFlow Web handoff

VeraFlow Web exports a `.veraflow` or `.vf` source file as a self-contained HTML form. A recipient can double-click the HTML file, fill it in, check critical fields against the original information, and copy named text sections. The HTML file carries the form, styles, validation, and rendering code. Recipients need only a browser with local scripts enabled. Form data stays on the device.

## Start with the workflow

The underlying job is to enter a record once, check the details that would be costly to get wrong, and reuse the checked values in multiple destinations. Begin with one synthetic shipment or service case that produces both an email and a short ticket note. Measure how many times a user types, copies, or checks the same value, and whether they can recover from a mismatch or a blocked clipboard without losing work.

If an existing system already has trustworthy structured fields and can generate the required outputs, use that system first. A formula-only workbook in approved Excel is a quick baseline for a small number of outputs. A standalone interactive form is worth building when the same VeraFlow rules need to travel across teams or work without a shared system. [Excel data validation](https://support.microsoft.com/en-us/excel/get-started/apply-data-validation-to-cells) · [Excel TEXTJOIN](https://support.microsoft.com/en-gb/excel/functions/textjoin-function)

## First slice

1. Add an **Export as standalone HTML** path for authors. Start with a deterministic build command in this repository. A desktop menu action or a browser authoring page can call the same exporter later. Keep `.veraflow` as the editable source and embed a runtime version in the exported file.
2. Bundle the existing parser, renderer, field normalization, and comparison logic. Start with [the source parser](../src/core/source.ts), [form definitions](../src/core/form.ts), [session verification](../src/core/session.ts), and [comparison rules](../src/core/compare.ts). Keep the browser UI code in its own entry point. Match the desktop output for the same values and rendering context. Use the [language guide](veraflow-language-draft.md) and [portable fixtures](../examples/portable/) as the contract.
3. Render the form title, form and field instructions, labels, defaults, and conditional fields. Show unfilled optional fields under **Optional details**. Make **Needs attention** link directly to missing inputs and required checks. Keep the form usable by keyboard and announce comparison results without relying on color.
4. Let users paste or type an independently obtained source value to **Verify field**. Honor the form's `verify-by-default` and each field's `verify` override. Match against the original using the shared rules. A mismatch keeps the entered value, and an edit invalidates its previous check. This provides a value comparison. The user supplies the source value and decides which source to trust.
5. Use **Create output** to check requirements and show the selected output. Show named sections separately with **Copy** and offer **Copy entire output** using the configured separator. Keep the text selectable and offer a text download when clipboard access is unavailable. Test the actual exported file on managed Windows Edge and macOS Safari. Browser copy is subject to the environment's clipboard policy. [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
6. Keep the first export focused on manual form entry, verification, and text output. Give authors a clear export error for templates that depend on unsupported inputs such as linked CSV, CSV append, or clipboard/selection variables. Use a sample form to test on the intended managed machine before building more authoring features. If opening local HTML is disallowed, ask IT whether it can serve the same standalone file on an approved HTTPS intranet.

## Packaging and acceptance

- Export one UTF-8 `.html` with all code, styles, labels, and template data embedded. It should work after being moved or renamed, with the network disabled and without the authoring tool, an extension, a local server, or adjacent assets.
- Render author text and entered values as literal text. Treat embedded template data as inert data, escape it for its HTML embedding context, and use a restrictive Content Security Policy for the bundled code. Ship blank by default so responses and check marks cannot leak into a shared form. Keep responses in memory for the first slice.
- Open the deployed artifact through a `file:` URL and confirm zero network requests. Test a valid match, a mismatch, edits that clear verification, a conditional field, Unicode, literal braces, and output parity with desktop. Simulate a rejected clipboard write and confirm that the user can still select the exact output and copy it manually. Check form instructions and field instructions with a screen reader or an accessible-description assertion.
- Pilot one real workflow with synthetic values. Compare its steps and recovery against the simplest approved baseline. Record browser policy blockers and the gap between browser verification and native capture before taking on another workflow.

## Existing tools

- **Browser Kitty Local Form Builder** is the closest example of the packaging. It exports one HTML form with validation, local response history, and data export. Its documented workflow is collecting records for CSV or JSON. Use it as a reference for distribution or for jobs centered on collection. [Local Form Builder](https://browser-kitty.com/en/tools/local-form-builder/)
- **Text Blaze** is close to the text workflow. It combines a form with a dynamic snippet the user can insert into another web page. If an extension is approved and browser-only insertion is enough, try it before building. [Forms](https://blaze.today/guides/forms/) · [Setup](https://blaze.today/guides/quickstart/)
- **docassemble** is a candidate for server-hosted interviews that produce formal documents. Its guided input and document templates fit cases where central hosting is acceptable. [Document assembly](https://docassemble.org/docs/documents.html)

The proposed pilot combines standalone delivery with VeraFlow-compatible, verified text assembly. The comparison above is based on the products' documented features. Test fit with one representative workflow before committing to a larger build.
