# VeraFlow CLI

English · [简体中文](cli.zh-CN.md)

Run `npm ci` in the VeraFlow checkout, then use `./scripts/veraflow` on macOS or `node scripts/veraflow` where a shell launcher is unavailable. Commands can run from any directory when you supply paths to the launcher and input files. [PDF setup on macOS](../examples/source/pdf-demo.md#run-from-the-command-line)

```sh
./scripts/veraflow --help
./scripts/veraflow --help --json
./scripts/veraflow --version
```

| Command                                                                            | Result on stdout                                                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `inspect FORM`                                                                     | Form metadata with fields, constraints, options, output IDs, section IDs, and steps      |
| `fields FORM`                                                                      | Desktop-compatible extraction field definitions                                          |
| `validate FORM [--record RECORD] [--output-id ID \| --all]`                        | Successful syntax or render-readiness check                                              |
| `normalize RECORD`                                                                 | A strict JSON record                                                                     |
| `create RECORD [--title TITLE] [--body TEXT]`                                      | An editable form with the supplied body or a field summary                               |
| `merge RECORD FORM`                                                                | A strict JSON record after applying the values to the form                               |
| `prefill RECORD FORM`                                                              | An editable form with current responses and any still-valid checks                       |
| `extract TEXT FORM`                                                                | Labeled values as Desktop-compatible candidates with evidence                            |
| `candidates CANDIDATE_FILE FORM [--source TEXT]`                                   | Validated candidate JSON, with evidence checked against optional source text             |
| `compare TEXT RECORD FORM`                                                         | Evidence and comparison status for populated fields                                      |
| `csv FILE [--row N]`                                                               | CSV headers and row count, or one flat record. Use 1 for the first row after the header. |
| `row RECORD FORM [--output-id ID] [--format json\|csv\|tsv]`                       | One mapped spreadsheet row. CSV and TSV protect formula-like text.                       |
| `render RECORD FORM [--output-id ID \| --all] [--format text\|json]`               | Prepared text or an ordered array of named outputs and sections                          |
| `pdf RECORD FORM [--output-id ID] [--output PATH] [--force] [--format text\|json]` | Saved PDF path or a JSON receipt on macOS                                                |

Use `-` for one data input to read it from stdin. Forms are UTF-8 files. A record is a single flat JSON or JSON5 object with exact field IDs. Quoted identifiers retain their leading zeroes. Omitted fields leave existing responses and defaults in place, `null` clears a response, and `""` is explicitly empty. Dates and numbers in flat record exports are text.

`validate` with a record and `render` use Desktop’s checks. Choose `--output-id` if the form has multiple outputs and no declared default. Use `--all` for a JSON result containing every output. A failed check produces no partial output. Templates that require interactive verification can be checked and saved as prefilled forms in Desktop. Changing a checked value clears its check.

## Use with automation or an AI tool

Start with `--help --json` for the command catalog and `inspect` to discover a form’s field IDs, choice IDs, verification requirements, and output IDs. For extraction, provide `fields` output and the relevant text to the extractor. Validate the returned candidate file and review its proposed values and evidence. Pass your accepted values as a flat record to `merge`, `prefill`, or `render`. Candidate and comparison results describe evidence. Verification still follows the form’s rules. [Candidate format](veraflow-language-draft.md#candidate-exchange-v1)

These examples use fictional data supplied in the checkout.

```sh
./scripts/veraflow extract examples/source/service-intake-source.txt \
  examples/source/service-intake.vf > candidates.json

./scripts/veraflow candidates candidates.json examples/source/service-intake.vf \
  --source examples/source/service-intake-source.txt

./scripts/veraflow inspect examples/source/dispatch-report.vf
./scripts/veraflow validate examples/source/dispatch-report.vf \
  --record examples/source/dispatch-record.json5 --json-errors

./scripts/veraflow render examples/source/dispatch-record.json5 \
  examples/source/dispatch-report.vf --format json --json-errors
```

Treat stdout as the result and stderr as diagnostics. JSON envelopes such as `veraflow-form-info`, `veraflow-render`, and `veraflow-error` have a `format` and `version`. With `--json-errors`, a failure produces one JSON object on stderr and exits with a nonzero status. Branch on `error.code`. Some errors add `field`, `fields`, `line`, or `outputId`. Use the message for display.

The CLI runs locally. It reads the files you pass explicitly. For a CSV, select a row and pipe it into a form that accepts JSON records. The linked-CSV browser and interactive capture are available in Desktop. For `pdf` with stdin, supply `--output`. Use trusted templates and data when converting to PDF, and pass `--force` only when replacing an existing PDF is intentional.

## Collect and review a working record

Use `gaps FORM [--record RECORD] [--output-id ID | --step N]` to report incomplete work on stdout with exit status 0. Use `collection-request`, `collection-inspect`, `collection-respond`, `collection-review`, `collection-apply`, and `collection-close` for the exchange. The request command requires `--output PRIVATE.vf` to save the private state; stdout contains only the public request. Apply echoes an updated prefilled form and requires `--accept` after review. Use `map SOURCE MAPPING` for flat JSON or add `--form FORM` to preserve mapping provenance in a prefilled form.

`transformation-review` and `transformation-apply` use a proposal and the current prefilled form. `record-export` checks readiness for a scope and emits a fingerprinted snapshot. Include history only with `--include-history`. `record-inspect` checks the fingerprint of reviewed JSON. CLI validation does not record human approval. Follow the [complete fictional walkthrough and v1 exchange rules](record-interoperability.md).

For portable definitions, background inbox processing, and destination review, see [local workflow automation](workflow-automation.md).
