# VeraFlow source files and output sections

English · [简体中文](veraflow-language-draft.zh-CN.md)

Double-click a UTF-8 `.veraflow` or `.vf` file to launch VeraFlow and start a session. Install the desktop bundle first. If your system already uses another app for that extension, choose VeraFlow once in **Open With** and set it as the default if desired. You can also use **Open file…** on the **Recently opened templates** page. Recent templates are also available from the tray menu on Windows and the menu-bar menu on macOS. The desktop app stores up to 12 recent paths and titles locally. Reopening an entry reads the file from disk. **Clear recent templates** clears that list.

**Settings → Legacy template library → Templates → Import template file** creates a library copy for editing. This picker also accepts `.txt`. **Export .veraflow** saves the definition. Responses stay separate.

Open a CSV from Finder or File Explorer with **Open With → VeraFlow**, or use **Open file…** on the launcher. Use the first row for column names. Search all columns or enter a data row number. Use Previous and Next to browse groups of rows. The preview shows the selected row’s columns before you open it in Free Scanner or use it to fill a source template. When verification is enabled, Free Scanner checks the imported row in order and advances after each match. Blank cells are skipped. Select a template from your library or open one from disk. CSV columns match template fields by exact name. Values stay in the session unless you explicitly save them.

A header-free file uses the [plain brace rules](portable-templates.md#plain-text) and produces one Body section:

```text
Hello {{name}},
```

## Advanced source

Start with the exact first line `--- veraflow 2`, followed by a JSON object and a line containing only `---`. Use LF or CRLF header lines. This is a source-language version, separate from the JSON exchange envelope version. An unsupported explicit version yields an error.

Set the optional top-level `"workflow"` property to `"form"` for **Fill form** or `"scanner"` for **Scanner**. If the property is absent, opening the file prompts for a workflow. Both workflows have a button to switch modes with values intact. This property affects how VeraFlow opens a file. Renderers can ignore it.

```text
--- veraflow 2
{"title": "Customer greeting", "workflow": "form"}
---
Hello {{name}},
```

Set `title` to a readable name for the session and Recent list. It takes up to 250 characters on one line. Files without a title use the filename. When a template fails to open, the notice identifies the invalid setting or reports a source line for malformed JSON and block tags.

Declare fields under `fields`. Declarations emit no text. A field ID in the header or a condition uses ASCII letters, digits, hyphens, and underscores. Plain references also accept the names described by the plain brace rules. Undeclared references are inferred as text fields.

| Field property    | Meaning                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `boolean`, `text`, `textarea`, `email`, `date`, `number`, `radio`, or `dropdown`                                                                                                      |
| `label`           | Optional display label in Fill form and Scanner. Accepts Unicode and punctuation                                                                                                      |
| `multiline`       | Text only. Defaults to `false` for `text` and `true` for `textarea`                                                                                                                   |
| `allowBlankLines` | Text only. Defaults to `true` for multiline fields. Set to `false` to reject empty or whitespace-only lines within a multiline value                                                  |
| `optional`        | Boolean flag. An unset optional field contributes empty text                                                                                                                          |
| `default`         | JSON Boolean for a Boolean field. Other field defaults are strings. A selection default is its option ID                                                                              |
| `options`         | Radio/dropdown only. Array of objects with a unique string `id`, string `label`, and optional string `output`. A direct reference emits the selected option's `output` or its `label` |

Boolean fields accept `true` and `false` as values, represented as the strings `true` and `false` in CSV and VeraFlow's value-map API. They have no implicit default. Selections default to their first option when the header supplies no default. Typed fields reuse the portable format checks. A present blank optional text value can pass a blank test.

Labels are literal text. Keep the field ID in placeholders, conditions, and CSV headers. An inferred field uses a single-line editor initially. Declare the field to enforce its line rules for captured, pasted, or imported values as well. With `allowBlankLines: false`, a trailing newline also counts as an empty line. An optional field can still be left completely empty. VeraFlow preserves valid line breaks and reports invalid values so you can fix them.

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

Fill form places choices above text fields. Fields that control a condition come first within each group. In Scanner, choose a Boolean or other option in VeraFlow and apply it. Short lists use radio buttons. When verification is required, choose the value again to compare it. Legacy template archives have a separate directive grammar.

### Sections and delivery

Use `{{#section address "Address"}}` and `{{/section}}` on separate lines. A section has a unique ID, display label, and rendered text. Output follows source order. Once you use a section, put all output inside flat sections. Whitespace between sections is ignored. Text outside the sections is an error. The wrapper lines and the line break immediately before each closing tag are structural. To preserve a trailing break, add a blank line before the close.

Try the [RMA template](../examples/source/rma.veraflow). Its Boolean controls the To and Subject text. An empty Attention field omits the entire attention line. A whole address captured as one field stays literal, including any existing `ATTN:` spelling.

1. Fill the form and choose **Prepare output sections**. Widen the window to keep the preview beside the fields while scrolling. Scanner also moves its preview to the right in a wide window. **Settings → Hide live output preview** turns off live rendering in the form. Focused view adds progress to Fill form and retains the focused Scanner layout.
2. Focus the destination and press the output shortcut. The Windows default is **Ctrl+Alt+8**. VeraFlow pastes one section at a time. **Press Tab where the template has no keys** is opt-in. **Paste sections together** joins section text with one newline by default. To use a blank line or another separator, set `"delivery": {"separator": "\n\n"}` in the header. This separator applies to the grouped block, including when you save it as text.
3. A failed paste keeps the section selected. Check the destination before retrying, or use **Copy current section** and paste manually. Previous and next move within the prepared output. **Save output as text** saves plain text, with section labels when exporting several separate sections. **Edit responses** returns to the session. Prepared output stays in memory until you close, replace, or edit the session.

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

Choose **Close session** and select **Save prefilled template**, **Save output as text**, or **Close without saving**. **Keep working** and canceling the save picker leave your session open. From prepared output, **Return to filled form** or **Return to filled Scanner** brings you back to your responses.

A prefilled `.veraflow` copy opens in the workflow you used. It includes the template and the responses you entered, even if required fields remain unanswered. Responses are editable and any required verification starts fresh. The suggested filename uses the template title and a UTC timestamp. The file contains your responses in plain text. Use **Open file…** or double-click it to resume. **Import template file** and standard template exports carry the reusable definition and omit the saved responses. **Save output as text** is available once the required fields and checks are complete and writes the rendered output.

Prefilled files use a top-level `responses` object keyed by field ID. String values use the same representation as CSV cells, including stable option IDs and `"true"` or `"false"` for Booleans. A `null` entry stores an unanswered field and suppresses its template default. An empty string stores an explicit empty response. Missing keys fall back to field defaults. A plain template saved with responses uses `"syntax": "plain"` to preserve the original brace rules. The metadata carries no verification state.

## Recent outputs

Find **Recent outputs** on the launcher or in the tray menu. The desktop app keeps five rendered template results locally by default as soon as you prepare source output. Legacy template results enter the list on copy, paste, or export. Recent outputs hold rendered text. Save a prefilled template to reopen the editable responses. Select an entry to copy it again or save it as text. A rendered result with several sections is saved as one history entry. The history skips unfinished inputs and Free Scanner field transfers.

Set **Settings → Number of recent outputs to keep** from 0 to 20. Setting it to 0 clears the history and turns it off. **Clear output history** removes saved entries while keeping the current setting. Outputs are stored in plain text. The history has a 32 MiB storage limit and removes older entries first.

## CSV and existing libraries

Open a comma-separated UTF-8 file with headers and pick a row. Choose a template from the library or open a source template from disk. Columns match field IDs exactly. Try the [RMA CSV](../examples/source/rma.csv). The selected row supplies responses for this session.

Use **Open folder…** to browse and search a directory of `.veraflow` and `.vf` files, including subfolders. Relative paths distinguish templates with the same name. Put CSV files alongside templates if useful, then open them with **Open file…**. Use **Refresh folder** to pick up changes made outside VeraFlow.

Existing Email Mode templates retain their separate workflow and email-specific validation. Source sections are generic text. A future Email preset can add header validation and translate older templates. JSON export preserves a source template using `placeholderStyle: "source"`. Older builds can reject this style. Keep a compatible library backup before using it with an existing installation. The independent Python reader currently covers the earlier portable profile.

## VS Code

The [VeraFlow extension](../editors/vscode/README.md) adds highlighting, folding, paired brackets, and snippets to both file extensions. Type `vf-` in the editor to find snippets for a header, field reference, output section, or conditional.
