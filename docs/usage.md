# Using VeraFlow Web

[简体中文](usage.zh-CN.md) · [Examples](../examples/README.md) · [Desktop CLI and Web walkthrough](desktop-cli.md)

**Source → working record → named outputs → destination**

The working record is the set of field values held by the form across all steps. Stable field IDs connect those values to named outputs. Strict JSON lets the working record travel between tools. Copy or download the rendered output to use it in an email, ticket, or log.

## Inputs by surface

| Input | Web authoring page | Exported standalone HTML |
| --- | --- | --- |
| `.veraflow` or `.vf` template | Open a file to export. Its metadata header can use JSON5. | The editable template is built into the HTML at export time. |
| Flat record JSON or JSON5 | Under **Start from data**, choose **Open JSON / JSON5…**. | Under **Form tools**, open JSON / JSON5 for review or download the current responses as plain JSON. |
| Manual values and independently sourced checks | The authoring page prepares the file for a recipient. | Enter values and verify required fields in the form. |
| Labeled text | Use the exported form for extraction. | Under **Extract from source…**, paste text, open or drop one UTF-8 `.txt` file, or click **Read clipboard** if permitted. |
| VeraFlow candidate JSON | Use the exported form for candidate review. | Import through **Extract from source… → External extraction files** or open that dialog from **Form tools**. Save proposals from candidate review. |
| CSV | Convert a selected row to flat record JSON before prefilling. | Convert a row to candidate JSON for review, or review a flat record in **Form tools**. |

Standalone HTML excludes linked CSV, CSV append and context variables, clipboard and selection template variables, and Desktop bulk source comparison. Clipboard acquisition by explicit button and independent field verification are available in the form. The exported file works directly in a browser without a server, extension, or adjacent files.

## Choose a format for an external converter

- **Flat record JSON** carries known values for one record keyed by stable field IDs, such as `{"serial_number":"ABC123458","quantity_affected":"1"}`. Use canonical choice IDs and string or null values. Omitted keys leave existing values alone, `null` clears a field, and `""` carries an explicit empty value. Use it for Web prefill or Desktop **Form tools → Import JSON / JSON5…**.
- **CSV** is useful for many rows or spreadsheet workflows. Use a Desktop CSV workflow or select and convert one row for a Web form. A standalone HTML form holds one working record.
- **Candidate JSON** carries provisional values, alternatives, and quoted evidence for someone to review, especially when converting an email or call transcript. Export field descriptions from **External extraction files** to give a converter IDs, labels, aliases, instructions, and choices. The file contains no current responses. Return the strict VeraFlow candidate envelope illustrated by the [example](../examples/service-email-candidates.json).

Candidate files and field descriptions use strict JSON. To check imported quotations, supply the original text before importing candidates.

## Start from a record

1. Choose a UTF-8 `.json` or `.json5` file or paste the source into **Open JSON / JSON5…**. Select **Review data**. Use one flat object with unique keys and scalar values. Quote identifiers such as `"000184"` to keep their leading zeroes. Numbers and booleans become text values, with decimal digits preserved. Convert nested data, HTML structure, and XML outside VeraFlow. For visible text copied from a webpage, use **Extract from source…** on the form.
2. Choose **Generate a summary**, **Write your own output** with `{{field}}` placeholders, or **Use a form file**. A reusable form matches exact field IDs, shows current and incoming values, and keeps its named outputs and field rules. Review the values, then select **Open filled form**. **Download HTML form** saves a copy of the filled form with those initial responses.
3. In an already open HTML form, use **Form tools → Open JSON / JSON5…** to compare a second record. **Apply reviewed values** updates supplied fields. Unchanged values retain their checks. Changed values require any applicable checks again. The [dispatch example](../examples/README.md#dispatch-from-json) shows the round trip.

## Complete the form

1. Enter values manually or extract candidates. In **Review candidates**, resolve decisions first. Review the proposed values and evidence. Select replacements and ambiguous values explicitly. Matching values are collapsed. Fields with no candidate keep their current values.
2. Under **Needs attention**, use **Jump to next field** or a specific link. Verify critical fields against an independent source. A mismatch preserves your entry. Changing an answer clears its verification and flags affected prepared or copied output.
3. Choose **Create output** or, when available, **Prepare all step outputs**. Copy the sections or entire output to your destination. If clipboard access is blocked, use the selected text with the browser’s ordinary copy command or download the text. Choose **Download output JSON** to save the prepared output or the full set you explicitly prepared for a step. Choose **Next step** separately.
4. Use **Form tools → Download response JSON** before closing if you need to keep or send back the record. In Desktop 0.25.0, open the same template and choose **Form tools → Import JSON / JSON5…**. Review the changes and apply them. Verification is local to each session.

If a managed browser blocks local HTML or JavaScript, ask IT whether it can serve the same file over approved internal HTTPS. A mail attachment preview may display the file without running its form controls.
