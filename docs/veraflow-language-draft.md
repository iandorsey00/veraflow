# VeraFlow source files and output sections

English · [简体中文](veraflow-language-draft.zh-CN.md)

Double-click a UTF-8 `.veraflow` or `.vf` file to launch VeraFlow and start a session. Install the desktop bundle first. If your system already uses another app for that extension, choose VeraFlow once in **Open With** and set it as the default if desired. You can also select **Open file…** on the **Recent sessions** page.

When closing a filled template, choose **Save to Recent Sessions** to reopen its editable responses later from the launcher, tray, or menu bar. VeraFlow keeps up to 12 saved sessions locally, including separate records from the same template. Resaving a resumed session updates its entry. **Close without saving** discards the current changes. **Clear recent sessions** removes these local copies. Responses are stored in plain text in `recent-sessions.json` in the app data directory.

**Settings → Legacy template library → Templates → Import template file** creates a library copy for editing. This picker also accepts `.txt`. **Export .veraflow** saves the definition. Responses stay separate.

Open a CSV from Finder or File Explorer with **Open With → VeraFlow**, or use **Open file…** on the launcher. Use the first row for column names. Search all columns or enter a data row number. Use Previous and Next to browse groups of rows. The preview shows the selected row’s columns before you open it in Free Scanner or use it to fill a source template. When verification is enabled, Free Scanner checks the imported row in order and advances after each match. Blank cells are skipped. Select a template from your library or open one from disk. CSV columns match template fields by exact name. Values stay in the session unless you explicitly save them.

A header-free file uses the [plain brace rules](portable-templates.md#plain-text) and produces one Body section:

```text
Hello {{name}},
```

## Advanced source

Start with the exact first line `--- veraflow 2`, followed by a JSON object and a line containing only `---`. Use LF or CRLF header lines. This is a source-language version, separate from the JSON exchange envelope version. An unsupported explicit version yields an error.

Set the optional top-level `"workflow"` property to `"form"` for **Fill form**, `"scanner"` for **Scanner**, `"csv"` for [linked CSV](#linked-csv), or `"append"` for [Append row](#append-row). If the property is absent, opening the file prompts for a workflow. Form and Scanner have a button to switch modes with values intact. This property controls how VeraFlow obtains input. Renderers that already have values can ignore it.

```text
--- veraflow 2
{"title": "Customer greeting", "workflow": "form"}
---
Hello {{name}},
```

Set `title` to a readable name for the session and Recent list. It takes up to 250 characters on one line. Files without a title use the filename. When a template fails to open, the notice identifies the invalid setting or reports a source line for malformed JSON and block tags.

Declare fields under `fields`. Declarations emit no text. Field names are case-sensitive and can contain spaces, Unicode, and punctuation. For names with braces or other characters that would be interpreted as syntax, use a JSON-quoted reference such as `{{"Location {code}"}}`. Conditions accept quoted field names too, as in `{{when "Location {code}" is not blank: 'Ready'}}`. Undeclared references are inferred as text fields.

| Field property    | Meaning                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `boolean`, `text`, `textarea`, `email`, `date`, `number`, `radio`, or `dropdown`                                                                                                      |
| `label`           | Optional display label in Fill form and Scanner. Accepts Unicode and punctuation                                                                                                      |
| `multiline`       | Text only. Defaults to `false` for `text` and `true` for `textarea`                                                                                                                   |
| `allowBlankLines` | Text only. Defaults to `true` for multiline fields. Set to `false` to remove empty or whitespace-only lines automatically                                                             |
| `optional`        | Boolean flag. An unset optional field contributes empty text                                                                                                                          |
| `default`         | JSON Boolean for a Boolean field. Other field defaults are strings. A selection default is its option ID                                                                              |
| `options`         | Radio/dropdown only. Array of objects with a unique string `id`, string `label`, and optional string `output`. A direct reference emits the selected option's `output` or its `label` |

Boolean fields accept `true` and `false` as values, represented as the strings `true` and `false` in CSV and VeraFlow's value-map API. They have no implicit default. Selections default to their first option when the header supplies no default. Typed fields reuse the portable format checks. A present blank optional text value can pass a blank test.

Labels are literal text. Keep the field ID in placeholders, conditions, and CSV headers. An inferred field uses a single-line editor initially. Declare the field to enforce its line rules for captured, pasted, or imported values as well. With `allowBlankLines: false`, VeraFlow strips blank lines from defaults, saved responses, CSV values, and text accepted in Form or Scanner. This includes leading and trailing blank lines. A form editor cleans up the visible text when you leave the field. Scanner applies the same cleanup when comparing original text. Single-line fields still reject line breaks.

Use `default` for reusable values. Save case-specific responses in a prefilled copy or supply them from a CSV row.

```text
--- veraflow 2
{
  "fields": {
    "ticket_id": {"type": "text", "label": "Ticket #"},
    "address": {
      "type": "text",
      "label": "Ship to · full address",
      "multiline": true,
      "allowBlankLines": false
    },
    "country": {"type": "text", "label": "Country", "default": "United States"}
  }
}
---
Ticket {{ticket_id}}
{{address}}
{{country}}
```

### Conditions

Use `{{when condition: 'text' else: 'other text'}}` for a phrase within a line. Either single or double ASCII quotes can enclose a branch. Placeholders inside a branch are expanded only when that branch is selected. Spaces and line breaks outside the quotes, inside the statement, are formatting. Put `\n` inside a string when the output needs a line break. Omit `else` to emit nothing when the condition is false.

```text
Hello{{when Name is not blank:
  ' {{Name}}'
}}, your order is ready.

{{when doa: '"Joe Sample" <joe.sample@example.com>'
  else: 'dispatch@example.com'}}
```

Only a declared Boolean can be used as a bare condition. Use `route=review` to match a stable option ID. Use `Name is blank` or `Name is not blank` to test missing, empty, or whitespace-only text. Strings support JSON escapes, plus `\'` inside single quotes. In a quoted branch, write `\\{{field}}` to display the placeholder literally. Values inserted by a placeholder stay literal even if they contain template markers. The JSON metadata header still uses double quotes.

Use block tags when a branch spans multiple output lines. Put each `{{#when …}}`, `{{else}}`, and `{{/when}}` on a line of its own. VeraFlow consumes the tag lines and preserves the line breaks in the selected branch.

```text
{{#when attn is not blank}}
Attn: {{attn}}
{{/when}}
```

Use `{{when Route equals "Express": 'Priority'}}` to compare the whole field and `{{when Address contains 'Suite': 'Check access'}}` to find a substring. Both comparisons are case-sensitive and use the raw value, including an option ID when comparing a choice. A missing value fails either comparison. An explicitly empty value matches `equals ""`. These operators also work in block tags and `else if`.

Fill form places choices above text fields. Fields that control a condition come first within each group. In Scanner, choose a Boolean or other option in VeraFlow and apply it. Short lists use radio buttons. When verification is required, choose the value again to compare it. Legacy template archives have a separate directive grammar.

### Comments and loops

In an advanced source file, use `{{! This note is for template authors }}`. An inline comment emits nothing. A line containing only a comment and optional whitespace is removed with its line break. Comments end at the first `}}` and stay on one line. The metadata header uses standard JSON.

Use a loop for a fixed list or a numbered sequence. Put both tags on their own lines.

```text
{{#for task in ["Check label", "Confirm destination"]}}
- {{task}}
{{/for}}
{{#for n in range(1, 4)}}
Copy {{n}}
{{/for}}
```

Lists accept JSON strings, numbers, and Booleans and preserve their order. Ranges use an exclusive end. `range(7)` gives 0 through 6, and `range(1, 8)` gives 1 through 7. A loop name is local to its body, so it does not create a form field. It can be used in a condition inside the loop. Each loop has up to 100 items, and VeraFlow limits the total expansion of nested loops. Loops repeat text within a section.

### Built-in variables

Built-ins begin with `@`. In an advanced template, use `{{@date "%Y-%m-%d"}}` for a date or `{{@timestamp}}` for an ISO 8601 timestamp. These use UTC and stay fixed while a session is open. The date format supports `%Y`, `%m`, `%d`, `%H`, `%M`, `%S`, and `%%` (a literal percent). Open a new session to use a new timestamp. A renderer supplying its own context can use a fixed timestamp to reproduce the result.

- `{{@template}}` gives the template name and `{{@output}}` the selected output label.
- In linked CSV mode, `{{@row}}` starts at 1 for the first data row, `{{@rows}}` counts all data rows, and `{{@csv_file}}` gives the template's relative CSV path. These variables are empty outside linked CSV mode.
- Built-ins also work in filename patterns and the CSV row label. Row labels use each entry's own row number.

Try the [dispatch note example](../examples/source/dispatch-note.veraflow).

### Sections and delivery

Use `{{#section address "Address"}}` and `{{/section}}` on separate lines. A section has a unique ID, display label, and rendered text. Output follows source order. Once you use a section, put all output inside flat sections. Whitespace between sections is ignored. Text outside the sections is an error. The wrapper lines and the line break immediately before each closing tag are structural. To preserve a trailing break, add a blank line before the close.

Try the [RMA template](../examples/source/rma.veraflow). Its Boolean controls the To and Subject text. An empty Attention field omits the entire attention line. A whole address captured as one field stays literal, including any existing `ATTN:` spelling.

1. Fill the form and choose **Prepare output sections**. Widen the window to keep the preview beside the fields while scrolling. Scanner also moves its preview to the right in a wide window. **Settings → Hide live output preview** turns off live rendering in the form. Focused view adds progress to Fill form and retains the focused Scanner layout.
2. Focus the destination and press the output shortcut. The Windows default is **Ctrl+Alt+X**. VeraFlow pastes one section at a time. **Press Tab where the template has no keys** is opt-in. **Paste sections together** joins section text with one newline by default. To use a blank line or another separator, set `"delivery": {"separator": "\n\n"}` in the header. This separator applies to the grouped block, including when you save it as text.
3. A failed paste keeps the section selected. Check the destination before retrying, or use **Copy current section** and paste manually. Previous and next move within the prepared output. **Save output as text** saves plain text, with section labels when exporting several separate sections. **Return to Form** or **Return to Scanner** takes you back to your filled responses. Prepared output stays in memory until you close, replace, or edit the session.

### Change the paste order for a session

Open **Paste options → Reorder sections…** on the output screen. Use the up and down buttons to match the destination's field order. Moving a section restarts at the first section. While the custom order is active, VeraFlow pastes one section per shortcut and sends no navigation keys. Put the cursor in each destination field before pasting.

**Reset to template order** restores the original order and the paste settings you had before reordering. The override affects delivery and manual section navigation. Text exports, saved templates, and recent output retain the template order. The next session starts with template order.

### Keystrokes between sections

Use the optional top-level `delivery` object. `mode` defaults to `"step"`. In step mode, one shortcut pastes the current section, issues its keys, and waits for the next shortcut. Set `"mode": "sequence"` to paste all remaining sections from the current position with one shortcut. **Paste options → Paste mode** overrides this preference for the current session.

```json
{
  "delivery": {
    "mode": "step",
    "after": {
      "recipient": ["Tab", "Tab"],
      "subject": ["Tab"]
    }
  }
}
```

`after` maps section IDs to ordered lists of up to 16 `"Tab"` or `"Shift+Tab"` keys. An empty list explicitly skips navigation. Omitted entries send no keys unless the Tab fallback is enabled. Set the fallback for new sessions in **Settings → Press Tab where the template has no keys**, or change it for the current session on the delivery screen. The last section sends no navigation, and grouping sections pastes one block. Navigation keys and paste mode affect desktop delivery. A custom separator affects only grouped output.

Try both modes with the [example files and local test form](../examples/source/README.md). In sequence mode, VeraFlow checks that the foreground window on Windows or application on macOS remains the same. If a paste or navigation step fails, the pending section stays selected. Inspect the destination before retrying.

## Save and reopen a session

Choose **Close session** and select **Save prefilled template**, **Save output as text**, or **Close without saving**. **Keep working** and canceling the save picker leave your session open. From prepared output, **Return to Form** or **Return to Scanner** brings you back to your responses.

A prefilled `.veraflow` copy opens in the workflow you used. It includes the template and the responses you entered, even if required fields remain unanswered. Checked fields reopen as verified in the workflow that checked them. Editing a field clears its check, and you can reverify at any time. The suggested filename uses the template title and a UTC timestamp. The file contains your responses in plain text. Use **Open file…** or double-click it to resume. **Import template file** and standard template exports carry the reusable definition and omit the saved responses and checks. **Save output as text** is available once the required fields and checks are complete and writes the rendered output.

Prefilled files use a top-level `responses` object keyed by field ID. String values use the same representation as CSV cells, including stable option IDs and `"true"` or `"false"` for Booleans. A `null` entry stores an unanswered field and suppresses its template default. An empty string stores an explicit empty response. Missing keys fall back to field defaults. A plain template saved with responses uses `"syntax": "plain"` to preserve the original brace rules. An optional top-level `verification` object maps checked fields to `"form"` or `"scanner"`. Each entry requires a nonblank saved response. It records the source session’s check, so reopen copies you trust.

## Recent outputs

Find **Recent outputs** on the launcher or in the tray menu. The desktop app keeps five rendered template results locally by default as soon as you prepare source output. Legacy template results enter the list on copy, paste, or export. Recent outputs hold rendered text. Save a prefilled template to reopen the editable responses. Select an entry to copy it again or save it as text. A rendered result with several sections is saved as one history entry. The history skips unfinished inputs and Free Scanner field transfers.

Set **Settings → Number of recent outputs to keep** from 0 to 20. Setting it to 0 clears the history and turns it off. **Clear output history** removes saved entries while keeping the current setting. Outputs are stored in plain text. The history has a 32 MiB storage limit and removes older entries first.

## CSV and existing libraries

Open a comma-separated UTF-8 file with headers and pick a row. Choose a template from the library or open a source template from disk. Columns match field IDs exactly. Try the [RMA CSV](../examples/source/rma.csv). The selected row supplies responses for this session.

### Linked CSV

Add `workflow` and `csv` to the template’s JSON header to open directly on the Output page. VeraFlow reads the CSV next to the template or in one of its subfolders. Use `/` between path components on every platform.

```veraflow
--- veraflow 2
{
  "title": "Service visits",
  "workflow": "csv",
  "csv": {
    "file": "data/visits.csv",
    "rowLabel": "{{Reference}} · {{Contact name}}"
  }
}
---
Hello {{Contact name}}, your reference is {{Reference}}.
```

The CSV uses UTF-8 and nonblank, unique column headers. Headers match field names exactly, including case and spaces. An empty cell supplies an empty string. A field with no matching column uses the template’s default if it has one. The optional `rowLabel` uses literal text, placeholders for CSV columns, and built-in variables. Every label starts with the row number. Without `rowLabel`, VeraFlow summarizes the first few cells. The CSV limit is 64 MiB and 100,000 data rows. The row dropdown groups large files into pages of 500 rows.

Use the **Row** dropdown above **Output** to select any combination. The row arrows move through rows for the current output and cross into the next or previous output at the ends. The output arrows keep the current row. Use Tab to focus the selectors or buttons, then use the dropdown’s native keyboard controls or press Enter or Space on an arrow button. In Form and Scanner, the output selector has the same output arrows when multiple outputs exist. Try the [linked template](../examples/source/linked-records.veraflow) with its [companion CSV](../examples/source/linked-records.csv).

Use **Open folder…** to browse and search a directory of `.veraflow` and `.vf` files, including subfolders. Relative paths distinguish templates with the same name. Put CSV files alongside templates if useful, then open them with **Open file…**. Use **Refresh folder** to pick up changes made outside VeraFlow.

Existing Email Mode templates retain their separate workflow and email-specific validation. Source sections are generic text. A future Email preset can add header validation and translate older templates. JSON export preserves a source template using `placeholderStyle: "source"`. Older builds can reject this style. Keep a compatible library backup before using it with an existing installation. The independent Python reader currently covers the earlier portable profile.

### Append row

Choose **Append row** from Form, Scanner, or CSV mode. Review the destination and cells, then write to the end of the file. The desktop app accepts an existing UTF-8 CSV with unique headers, including a file with only a header. If the file was changed or locked by another app, your record stays open. Use **Change or reload CSV…** and review the row again. Use one writer at a time for shared logs.

Use `outputs.<id>.row` to map destination column headers to cell templates. Use `main` for the implicit output. Each cell supports placeholders, conditions, variables, and block loops. A loop builds text in one cell. When the mapping is omitted, fields match headers by exact name. With a mapping, VeraFlow requires every named destination column. Additional columns are left empty. Written cells follow the destination's column order.

```json
{
  "append": {
    "file": "shipment-log.csv",
    "duplicateKey": "Reference",
    "carryForward": ["Carrier"]
  },
  "outputs": {
    "main": {
      "row": {
        "Reference": "{{Reference}}",
        "Carrier": "{{Carrier}}",
        "Logged": "{{@date '%Y-%m-%d'}}"
      }
    }
  }
}
```

All three `append` settings are optional. `file` is relative to the template and points to a CSV in the same folder or a subfolder. `duplicateKey` names a destination column for exact matches. Review the matching row and confirm if you want to append anyway. `carryForward` lists fields whose current values survive **Append and start next**. Other fields reset to defaults or empty, and verification starts fresh. A successful write shows the file and data row number.

**Copy as spreadsheet row** prepares a tab-delimited row for pasting into Excel. It works without a destination and uses the mapping order in that case. If the mapping fits the selected CSV, copy follows the destination order. Text that looks like a spreadsheet formula gets a leading apostrophe, shown in the preview.

Form, Scanner, and Append share the working record. CSV browsing keeps the draft and remembers the selected row. **Use this row in Form** asks before it replaces an existing draft. If a session starts in CSV with no draft, switching away loads the selected row as unverified. A `csv` link can appear regardless of the startup workflow.

Try the [shipment log template](../examples/source/shipment-log.veraflow) with a copy of the [sample CSV](../examples/source/shipment-log.csv).

## VS Code

The [VeraFlow extension](../editors/vscode/README.md) adds highlighting, folding, paired brackets, and snippets to both file extensions. Type `vf-` in the editor to find snippets for a header, field reference, output section, or conditional.

## One record with multiple outputs

Place each independent output between `{{#output id "Label"}}` and `{{/output}}` on their own lines. Use unique output IDs and put all rendered text inside the blocks. Each output can contain ordinary text or its own `section` blocks. Declare shared fields once in the header. A declared field can exist solely in the record.

Choose an output in the form or Scanner to preview and prepare it. Changing the selection keeps the record and shows just the chosen output. In the output view, copy one paste section or use **Copy entire output**. Switch outputs directly on the Output screen. Switching starts at the first section. If an output has missing or unverified fields, VeraFlow keeps the current output available and shows an error. Use literal tabs in a body to make a row that can be pasted into a spreadsheet. Keep each value on one line when the destination treats a newline as a new row. See the [shared-record example](../examples/source/shared-record.veraflow).

An optional `"outputs"` object keys settings by output ID. Put paste settings under that output’s `"delivery"` object. Omitted delivery properties inherit the top-level defaults. If specified, `after` replaces the default navigation map. Section IDs and navigation apply within one output.

```json
{
  "delivery": { "mode": "step" },
  "outputs": {
    "email": {
      "delivery": { "mode": "sequence", "after": { "subject": ["Tab"] } }
    }
  }
}
```

Existing files with delivery properties directly under an output ID continue to work.

Use **Save record as JSON…** to store field IDs with their raw values. Unanswered values are `null`. **Save prefilled template** saves the source and values together for reopening. The optional header property `"filename"` sets the suggested filename stem for saves. It can use `{{timestamp}}`, `{{template_name}}`, `{{workflow_name}}`, `{{output_name}}`, and `{{field.Reference}}`. It also accepts built-ins such as `{{@date "%Y-%m-%d"}}` and `{{@row}}`. An unanswered field inserts nothing. The app sanitizes the stem, adds the extension, and lets you choose whether to replace an existing file in the native save dialog.

## Conditions and source evidence

Use `not ready` with a declared Boolean to test explicitly for false. An unanswered Boolean stays unresolved. Add `else if` before the final `else` to test alternatives in order. For a block use `{{else if review}}` on its own line. For inline output write `{{when not ready: 'Hold' else if review: 'Review' else: 'Ready'}}`.

**Compare source text…** in a form or Scanner compares filled fields with a pasted block. It checks lines such as `Reference: VF-104` against the field ID or label. A whole matching line without a label is weaker evidence. Multiple candidates, conflicts, and missing lines are reported separately. Batch comparison leaves verification status unchanged. Use the individual source check to verify a field. A requested paste is separate from proof of accurate transfer or completion in the destination app.
