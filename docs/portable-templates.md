# Portable templates and saved information

This is the first interoperability profile for VeraFlow. It uses UTF-8 text and the existing version 1 template and workspace JSON archives. The same template and value map produce ordered, named text parts regardless of where the values came from. Clipboard actions, verification, session history, and email delivery are outside the format.

For the source-language profile with Boolean conditions and named sections, see [VeraFlow source files](veraflow-language-draft.md).

## Fill a template by hand

Open a UTF-8 text file containing:

```text
Booking {{reference}} for {{name}} ({{reference}}).
Note: {{note}}
```

Use this table of values:

| Field     | Value        |
| --------- | ------------ |
| reference | AB-104       |
| name      | 李梅         |
| note      | Empty string |

Read the source once from left to right. Replace each placeholder with its table value. Both references to `reference` become `AB-104`. The result has an empty value after `Note: `, including the original space. If the table omitted `note`, the renderer would report a missing value.

## Plain text

- Read source and values as UTF-8 Unicode text. Treat an initial UTF-8 BOM as an encoding marker when reading a standalone text file. Inside a JSON string, U+FEFF is a character. Preserve line endings, spacing, and Unicode characters in the body. Compare field names exactly, with case and normalization preserved.
- A placeholder is `{{field}}`. First check the source between the braces. It must exclude braces, angle brackets, control characters (Cc), format characters (Cf), and U+2028/U+2029. Then trim leading and trailing ECMAScript whitespace and require a nonempty name. Preserve internal spaces. Unrecognized or empty placeholders are literal text.
- At an unescaped backslash, `\\` emits one backslash and `\{{` emits literal opening braces. Other backslashes remain as written. Recognize escapes and placeholders from left to right in the source. Escape each opening delimiter you intend to display literally.
- Look up each occurrence in the same string map. An absent key is missing and yields `missingValue`. A present key with `""` inserts zero characters. Use strings for every value, including numbers and dates. Match only actual keys of the map.
- Append values literally in one pass. A value containing `{{anything}}` or a backslash comes through unchanged. Inserted values are never parsed as template syntax.
- In a standalone plain-text template, every valid name is a lookup. In an archive marked `braces`, the dynamic directive forms below are reserved. Avoid those forms as plain field names. Existing archives with `placeholderStyle: "angle"` or an omitted style retain the legacy `<field>` and `\<` behavior, without dynamic directives. Angle-style names also exclude whitespace.

## Dynamic forms and structured output

A template archive has the envelope `{"format":"veraflow-templates","version":1,"templates":[...]}`. Each definition has string `id`, `name`, `folder`, and `content`, a string array `fieldOrder`, a boolean `verificationEnabled`, and a `comparison` object. The comparison object contains `mode` (`exact` or `whitespace`), plus booleans `caseSensitive`, `unicode`, `punctuation`, and `collapseLines`. Optional properties are `placeholderStyle`, `extraFields` (string array), `typingVerification` (boolean), and `email`. The archive carries definitions only. VeraFlow assigns new local IDs when importing copies. Field order, extra Scanner fields, and verification/comparison settings are application metadata and do not affect portable output.

### Field definitions

Recognize directives inside double braces. A directive starts with its lowercase keyword, one ASCII space, and a case-sensitive field ID from `[A-Za-z0-9_-]+`. Option IDs use the same alphabet. Quoted values are JSON strings, so authors can include a pipe, escaped quote, or a newline via `\n`. NUL in a directive string is invalid. Physical newlines are outside the portable directive syntax. A field can be declared once across the active output parts, and can be referenced before or after its declaration. Declarations also insert the field value or emitted label at their location.

| Syntax inside braces                                       | Meaning                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `text subject: "Update"`                                   | Text with an optional quoted default                                                |
| `textarea notes?:`                                         | Multiline text, optional thanks to `?`                                              |
| `email address:`                                           | Text with an email format check                                                     |
| `date due: "2026-12-01"`                                   | Valid Gregorian date, YYYY-MM-DD, year 0001–9999                                    |
| `number quantity: "1"`                                     | Finite decimal number, with optional sign and exponent. Preserve the input spelling |
| `radio route: desk="Front desk" \| dock="Loading dock"`    | One selected ID, with a corresponding label                                         |
| `dropdown route: desk="Front desk" \| dock="Loading dock"` | Same value semantics as radio                                                       |
| `checkbox tracking: yes="Tracked" \| no=""`                | Boolean selection with exactly the IDs `yes` and `no`                               |
| `switch tracking: yes="Tracked" \| no=""`                  | Same value semantics as checkbox                                                    |

`select` is an alias for `radio`. Provide at least one and at most 100 options with unique IDs. The first option is the default for radio and dropdown. Checkboxes and switches default to `no`. The supplied string is the ID, and the option's quoted text is both its emitted value and its form label in VeraFlow. A label may be empty. For an empty label, VeraFlow can display its ID in the form.

A text-like field uses a colon, then an optional quoted default, then an optional condition. For example, `{{textarea instructions?: "Call ahead" when route=dock}}` defines an optional field visible when `route` has the ID `dock`. The comparison uses the ID. A condition can refer only to a declared selection and an existing option.

### Resolve and render

1. Determine the active output parts described below. Read their declarations as a group. Duplicate declarations, unknown selection references or option IDs in conditions, defaults that fail their type checks, and a declaration sharing an `extraFields` name are definition errors (`invalidFormDirective`). Strings and plain literals are inert.
2. Start with the supplied strings. Add defaults only for absent keys. Supply `""` for any absent optional field without a default. An explicitly empty string overrides a default.
3. Evaluate each field's visibility against the resolved option IDs. Omit a hidden field from validation and emit empty text for every reference to it. A hidden response can remain in the supplied map. Literal text around the field still renders, so put any conditional heading or punctuation inside a `when` expression.
4. An absent required visible value yields `missingValue`. An empty optional field is valid. For a declared text or textarea field, any string containing a non-whitespace character is valid. For email, require one `@`, a nonempty local part, and a dot inside the nonempty domain. Reject whitespace and angle brackets in this field type. This is a format check. For numbers, accept ASCII digits with an optional decimal point, sign, and `e` or `E` exponent. Require a finite IEEE 754 binary64 value. For selections, require an exact option ID. An invalid visible value yields `invalidControlValue`. Plain placeholders accept any string, including an empty one.
5. Resolve ordinary references and declarations to their string or selected label. `{{when route=dock: "Use the loading dock"}}` emits that string for `dock` and empty text for other IDs. For legacy archives, `{{choice route: desk="Use the front desk" | dock="Use the loading dock"}}` emits the mapped string or empty text when the selected ID is omitted. Neither form creates a second input. Do not reparse any emitted text.

For new templates, use `when` when a single condition emits a phrase, and use an existing selection directly when its label is already the desired output. A definition-only field with independent display labels would remove the need to place a declaration in an output part. Version 1 has no such construct. For a routing-only field, the v1 shortcut is a radio or dropdown directly in **To**, using addresses as labels and emitted values.

### Email parts

Without enabled email, the result is the single `body` part sourced from `content`. With enabled email, `email` contains boolean `enabled`, strings `subject`, `to`, `cc`, `bcc`, and booleans `ccEnabled` and `bccEnabled`. Optional `subjectEnabled` defaults to true. Optional `order` is a permutation of `["subject","to","cc","bcc"]`, which is also the default order. Emit only enabled headers, with `to` always enabled. Emit `body` last. Disabled header sources do not contribute declarations or values.

ECMAScript whitespace for trimming consists of U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028–2029, U+202F, U+205F, U+3000, and U+FEFF. For a header, trim that whitespace on each substituted value before joining and on the whole part after joining. Preserve Body exactly. Require nonempty To and enabled Subject. Report `emailRequired` for an empty required header. In every rendered header, reject any remaining Unicode control (Cc), line separator (Zl), or paragraph separator (Zp) as `emailHeaderInvalid`. Each output is an ordered list of records such as `{"key":"to","text":"dispatch@example.test"}`. This is structured text for review and transfer. It has no sending behavior.

### Reproduce a booking email

The [template archive](../examples/portable/booking-template.json) defines the `DOA` option IDs `no` and `yes`. In the Body, they emit `Standard` and `DOA review`. In To, they route to different addresses. The note field is visible and required for `yes`.

| Field     | Standard case           | Review case                     |
| --------- | ----------------------- | ------------------------------- |
| reference | AB-104                  | AB-104                          |
| name      | 李梅                    | 李梅                            |
| DOA       | no                      | yes                             |
| note      | This response is hidden | Inspect {{literal}} on arrival. |

The Standard output, in order:

```text
Subject: Booking AB-104
To: dispatch@example.test
Body:
Routing: Standard
Booking AB-104 for 李梅 (AB-104).
Regards, Ops
```

The Review output uses To `review@example.test` and Body:

```text
Routing: DOA review
Booking AB-104 for 李梅 (AB-104).
Review note: Inspect {{literal}} on arrival.
Regards, Ops
```

The [fixture file](../examples/portable/cases.json) gives the exact strings, including line endings, output order, and expected errors. Run the [independent Python reader](../examples/portable/reader.py) from the repository root with:

```sh
python3 examples/portable/reader.py --check
python3 examples/portable/reader.py examples/portable/booking-template.json examples/portable/review-values.json
```

Python's standard library is sufficient. For a standalone text file, run `python3 examples/portable/reader.py --plain TEMPLATE.txt VALUES.json`. The second command can use any value-map JSON file, including a saved row's `values` object. For an archive with multiple definitions, the example reader renders the first.

## Workspace exchange

### CSV

Use comma-separated UTF-8 text with a header row for the portable CSV profile. Use unique, case-sensitive, nonempty field names and equal column counts. Quote fields with commas, quotes, or line breaks. Double a quote inside a quoted field. Accept an optional UTF-8 BOM and CRLF or LF record breaks. Retain cell contents as strings, including leading zeros and text that resembles a formula. A blank cell represents an explicit empty string. A short record is malformed and cannot signal missing values. Use workspace JSON for sparse rows or metadata.

VeraFlow imports CSV as a new table and assigns local IDs. Its importer also offers delimiter detection for tabs and semicolons, header suggestions, and repair of blank or duplicate headings. It skips records with all empty cells. Use CSV for simple value exchange, and JSON when those records or exact column metadata matter. The repository includes a [synthetic CSV](../examples/portable/bookings.csv).

### Workspace JSON v1

The envelope is `{"format":"veraflow-workspace","version":1,"workspace":{"folders":[],"tables":[]}}`. An optional `workspace.snippets` array carries snippets. The full example shows all record shapes. [Synthetic workspace archive](../examples/portable/booking-workspace.json)

| Record  | Fields and relationships                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder  | `id`, `name`                                                                                                                                                                             |
| Table   | `id`, `name`, `folderId` (folder ID or empty for unfiled), ordered `fields` (strings), boolean `rowTitles`, `output` (literal text or a plain brace template), `externalIds`, and `rows` |
| Row     | `id`, `title`, `externalIds`, and `values`, an object keyed by declared table fields                                                                                                     |
| Snippet | `id`, `title`, `content` (literal text), and `tableId` (table ID or empty for unfiled)                                                                                                   |

All IDs, labels, names, titles, output, and values are strings. New VeraFlow workspace IDs use `VF-` followed by a UUID. IDs are unique across all folder, table, row, and snippet records and compared exactly. External references are arrays of `{"label":"source","value":"demo"}` records. They are descriptive and do not link records or deduplicate imports. In `values`, an omitted property is missing, an empty string is explicitly empty, and null is invalid. The table's column order comes from `fields`. A fieldless table treats its output as literal. Table field names use the same excluded characters as brace names, are already trimmed, and are unique within the table.

For an additive import, validate the incoming graph, including ID uniqueness, declared columns, and same-archive parent links. Preserve free IDs. Allocate a fresh ID for each ID that collides with the destination, and update incoming `folderId` and `tableId` references using the same mapping. Keep imported rows with their enclosing table and append the incoming graph without replacing destination records. A clean import preserves all IDs and relationships. Template definitions can travel in their own archive. The workspace does not require them to be bundled with the saved values.

## Reference implementation and compatibility

- VeraFlow's plain renderer and final email renderer are exercised by the shared fixtures. The value-map entry point uses the same final rendering and validation as completed sessions, with deterministic default application and without session checks. A fresh-library browser test exports a template, reimports it in a second library, and checks the actual prepared parts.
- VeraFlow session entry may treat a blank as unset. Scanner can explicitly skip a legacy placeholder. Verification can block output until a user checks a value. These are app policies. Exchange data preserves absence and explicit empty strings, and portable rendering takes resolved input strings directly.
- The first profile covers the documented directive syntax and the shared cases. Error precedence for inputs with multiple independent problems, malformed directive recovery, locale-specific input widgets, application byte/count limits, and native clipboard behavior are outside the shared fixtures. The small Python reader renders valid definitions and exercises fixture errors. It leaves full archive validation and workspace merging to importers.
- Version 1 is retained for both envelopes. Support for current dynamic directives depends on the implementation. Older VeraFlow versions can reject newer metadata or treat an unknown directive as a field. A format version alone does not guarantee every feature is supported.
