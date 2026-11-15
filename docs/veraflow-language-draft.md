# VeraFlow source files and output sections

Double-click a UTF-8 `.veraflow` or `.vf` file to launch VeraFlow and start a session. Install the desktop bundle first. If your system already uses another app for that extension, choose VeraFlow once in **Open With** and set it as the default if desired. You can also use **Open file…** on the **Recently opened templates** page. Recent templates are also available from the tray menu on Windows and the menu-bar menu on macOS. The desktop app stores up to 12 recent paths and titles locally. Reopening an entry reads the file from disk. **Clear recent templates** clears that list.

**Templates → Import template file** creates a library copy for editing. This picker also accepts `.txt`. **Export .veraflow** saves the definition. Responses stay separate.

Open a CSV from Finder or File Explorer with **Open With → VeraFlow**, or use **Templates → Open file…**. Use the first row for column names. Search all columns or enter a data row number. Use Previous and Next to browse groups of rows. The preview shows the selected row’s columns before you open it in Free Scanner or use it to fill a source template. Select a template from your library or open one from disk. CSV columns match template fields by exact name. Values stay in the session unless you explicitly save them. To import an entire CSV into a table, enable **Show Workspace tab** in Settings and use Workspace’s **Import CSV**.

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

`{{when doa: "Review" else: "Dispatch"}}` chooses quoted literal text. Only a declared Boolean can be used as a bare condition. Use an explicit match for a selection, such as `route=review`. Use `attn is blank` or `attn is not blank` to test missing, empty, or whitespace-only text. Inline `else` is optional.

For multiline text or a branch with placeholders, put the tags on their own lines:

```text
{{#when attn is not blank}}
Attn: {{attn}}
{{/when}}
```

When a condition reveals other fields, its controlling field appears before them in Fill form and Scanner. Short controlling choice lists show radio buttons you can change using the arrow keys. In Scanner, press Enter to apply the selection.

An optional `{{else}}` line selects the other branch. Only the selected branch contributes text and requires its fields. Tag lines are consumed. Quoted inline output and substituted values are literal, with no second pass. Structural tags are reserved in advanced source. Existing inline form directives belong to the legacy template grammar.

### Sections and delivery

Use `{{#section address "Address"}}` and `{{/section}}` on separate lines. A section has a unique ID, display label, and rendered text. Output follows source order. Keep section wrappers flat and place only whitespace between them. The wrapper lines and the line break immediately before each closing tag are structural. To preserve a trailing break, add a blank line before the close.

Try the [RMA template](../examples/source/rma.veraflow). Its Boolean controls the To and Subject text. An empty Attention field omits the entire attention line. A whole address captured as one field stays literal, including any existing `ATTN:` spelling.

1. Fill the form and choose **Prepare output sections**. **Settings → Hide live output preview** turns off live rendering in the form. Focused view adds progress to Fill form and retains the focused Scanner layout.
2. Focus the destination and press the output shortcut. The Windows default is **Ctrl+Alt+8**. VeraFlow pastes one section at a time. **Press Tab where the template has no keys** is opt-in. **Paste sections together** groups the sections with newline separators.
3. A failed paste keeps the section selected. Check the destination before retrying, or use **Copy current section** and paste manually. Previous and next move within the prepared output. **Save output as text** saves plain text, with section labels when exporting several separate sections. **Edit responses** returns to the session. Prepared output stays in memory until you close, replace, or edit the session.

### Keystrokes between sections

Use the optional top-level `delivery` object. `mode` defaults to `"step"`. In step mode, one shortcut pastes the current section, issues its keys, and waits for the next shortcut. Set `"mode": "sequence"` to paste all remaining sections from the current position with one shortcut. **Paste mode** overrides this preference for the current session.

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

`after` maps section IDs to ordered lists of up to 16 `"Tab"` or `"Shift+Tab"` keys. An empty list explicitly skips navigation. Omitted entries send no keys unless the Tab fallback is enabled. Set the fallback for new sessions in **Settings → Press Tab where the template has no keys**, or change it for the current session on the delivery screen. The last section sends no navigation, and grouping sections pastes one block. These options affect desktop delivery only. They leave rendered and saved text unchanged.

Try both modes with the [example files and local test form](../examples/source/README.md). In sequence mode, VeraFlow checks that the foreground window on Windows or application on macOS remains the same. If a paste or navigation step fails, the pending section stays selected. Inspect the destination before retrying.

## Save and reopen a session

Choose **Close session** and select **Save prefilled template**, **Save output as text**, or **Close without saving**. **Keep working** and canceling the save picker leave your session open.

A prefilled `.veraflow` copy opens in the workflow you used. It includes the template and the responses you entered, even if required fields remain unanswered. Responses are editable and any required verification starts fresh. The file contains your responses in plain text. Use **Open file…** or double-click it to resume. **Import template file** and standard template exports carry the reusable definition and omit the saved responses. **Save output as text** is available once the required fields and checks are complete and writes the rendered output.

Prefilled files use a top-level `responses` object keyed by field ID. String values use the same representation as CSV cells, including stable option IDs and `"true"` or `"false"` for Booleans. A `null` entry stores an unanswered field and suppresses its template default. An empty string stores an explicit empty response. Missing keys fall back to field defaults. A plain template saved with responses uses `"syntax": "plain"` to preserve the original brace rules. The metadata carries no verification state.

## Recent outputs

Find **Recent outputs** on the launcher or in the tray menu. The desktop app keeps five rendered template results locally by default after you copy, paste, or export them. Select an entry to copy it again or save it as text. A rendered result with several sections is saved as one history entry. The history skips unfinished inputs and Free Scanner field transfers.

Set **Settings → Number of recent outputs to keep** from 0 to 20. Setting it to 0 clears the history and turns it off. **Clear output history** removes saved entries while keeping the current setting. Outputs are stored in plain text. The history has a 32 MiB storage limit and removes older entries first.

## CSV and existing libraries

Open a source template and choose **Fill from CSV** in its editor. Pick a row from a comma-separated UTF-8 file with headers. Columns match field IDs exactly. Try the [RMA CSV](../examples/source/rma.csv). The selected row supplies responses without importing a Workspace table.

Workspace still carries tables, references, snippets, and sparse records. A directory of `.veraflow` and CSV files makes a shareable collection today. The app opens individual templates and CSV files. Browsing a directory as a package, linking files for synchronization, and Excel import are possible later additions.

Existing Email Mode templates retain their separate workflow and email-specific validation. Source sections are generic text. A future Email preset can add header validation and translate older templates. JSON export preserves a source template using `placeholderStyle: "source"`. Older builds can reject this style. Keep a compatible library backup before using it with an existing installation. The independent Python reader currently covers the earlier portable profile.

## VS Code

The [VeraFlow extension](../editors/vscode/README.md) adds highlighting, folding, paired brackets, and snippets to both file extensions. Type `vf-` in the editor to find snippets for a header, field reference, output section, or conditional.
