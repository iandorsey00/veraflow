# Local workflow automation

[简体中文](workflow-automation.zh-CN.md)

VeraFlow prepares and validates the record. VeraFlow Integrations handles the collection provider. A local worker reconciles a response directory, applies eligible answers, and fills a fictional employment website in a separate Chromium window. The user reviews the result and marks the instance complete. The worker never submits the destination form.

## Try the employment workflow

Use a source checkout with Node.js 24. Install the project dependencies and Chromium once.

```sh
npm ci
npx playwright install chromium
mkdir -p "$HOME/VeraFlow-demo-inbox"
scripts/veraflow workflow-worker "$HOME/VeraFlow-demo-inbox"
```

Open the dashboard URL printed by the worker. You can also choose **Workflows** in VeraFlow Desktop and enter the access key after `#` in the printed URL. Keep the worker running and the computer awake. The main VeraFlow window can close. Keep the URL and key private.

1. Choose **Add definition** and select [employment-workflow.json5](../examples/source/collection/employment-workflow.json5) and [employment.vf](../examples/source/collection/employment.vf). A definition and its blank form are pinned together when registered.
2. Choose **New instance**, then **Prepare questionnaire**. Upload the downloaded native request in the [private Google Forms dashboard](https://github.com/iandorsey00/veraflow-integrations/blob/main/docs/google-forms.md). Publish the specific form there and optionally add its respondent link to the instance. Use a separate instance and request for each respondent.
3. Configure your Drive client to synchronize the provider’s private response directory to the directory the worker watches. Make it available offline if your sync client uses placeholders. To test locally, open the request in VeraFlow Web and export an offline questionnaire, then import its response in the dashboard or save it into the watched directory. Each path returns the same native exchange format.
4. Start with a fictional name, employment status **在职**, and optional comments. After the first response, prepare the next questionnaire for the employer and job title. For a one-round demo, use **Supply values** or seed those known fields when creating the instance. In this example, supplying the name, employment status `employed`, and employer leaves the two questions from [answers.json](../examples/source/collection/answers.json).
5. For the exact answer `软件架构师`, VeraFlow records the original and translates it to `Software Architect`. Verify the resulting job title against an independent source before the worker can proceed. The other exact-match translation changes `可以远程办公。` to `Available to work remotely.`
6. With automatic autofill enabled, the worker opens the fictional site, fills its active fields, and reads the five values back. Use **Show populated page** to bring it forward. Use **Mark complete** when you finish reviewing it.

The Google dashboard already handles draft creation, respondent links, missed-response recovery, and closing a questionnaire. Keep its administration owner-only. Recover outstanding submissions there before closing a request locally. Local closure stops future intake for that request. Creating, publishing, and closing the provider’s questionnaire remain manual in this phase.

## Portable definition v1

A definition is paired with a blank VeraFlow form. The form supplies field types, stable field and option IDs, validation, instructions, and ordinary conditional applicability. The workflow adds collection and destination policy. Use UTF-8 JSON5 or JSON for authoring. Use strict UTF-8 JSON for machine exchange. Duplicate keys and unknown properties are errors. IDs are case-sensitive and independent of displayed titles or labels.

| Property                  | Meaning                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `version`       | `veraflow-workflow` and integer `1`.                                                                                                                                                                                                                                                                                                     |
| `id`, `revision`, `title` | Stable workflow and revision IDs, plus a human-readable title. IDs use 1–64 ASCII letters, digits, hyphens, or underscores and start with a letter or digit. Same-ID revisions are immutable once registered. Use a new revision to change the configuration or form.                                                                    |
| `scope`                   | Exactly one native scope. `{"outputId":"main"}` selects an output, `{"step":0}` a zero-based form step, and `{"step":null}` all outputs.                                                                                                                                                                                                 |
| `collection.provider`     | `google-forms` for an owner-dashboard handoff or `native-file` for native exchange and offline forms.                                                                                                                                                                                                                                    |
| `sourceMapping`           | Optional inline [native record mapping](record-interoperability.md), used only with a supplied source record. Without it, the source uses flat JSON or JSON5. Fields supplied by a source retain source provenance.                                                                                                                      |
| `transformations`         | Optional map keyed by form field ID. Each rule has `kind`, `from`, and `to`. A rule runs when the field is applicable and its stored value exactly equals `from`. The native history preserves the original value and transformation kind. The rule invalidates verification on a changed value.                                         |
| `destination`             | `adapter`, stable destination `id`, ordered `pages`, and `fields` mapping destination field IDs to form field IDs. This version runs `playwright-employment` with `fictional-employment` and `["intake"]`. Applicability follows the selected branch. Additional page navigation and its side-effect boundaries require a later adapter. |
| `policy`                  | `autofill` is `automatic` or `manual`. `defaults` is `confirm` or `allow-assumed`. `maxAttempts` is an integer from 1 through 5. `completion` is `human-review`.                                                                                                                                                                         |

With `confirm`, the worker starts defaulted fields as absent until actual values are supplied. A blank response and an unanswered field retain their native meanings. With `allow-assumed`, VeraFlow can use the form’s defaults, and its record export preserves their default provenance. Translations and browser readback are distinct from independent field verification. A missing answer, unresolved controlling field, invalid value, pending verification, or conflicting response holds the affected record out of the queue.

Keep credentials, private records, authenticated sessions, and local paths out of definitions. A definition can contain a public vocabulary mapping such as the sample job-title translation. Keep private source records and working forms in local storage. The public native request contains questions and choice IDs. The collection adapter never needs the private form or validated record.

## Operations and recovery

- The worker takes a stable observation of each regular JSON file before reading it. It periodically reconciles the whole directory and resumes from disk after restart. **Rescan inbox** requests an immediate pass. Use **Import response** for a file from elsewhere.
- Quarantine is a recorded classification. The original file stays where it arrived. Inspect the inbox for format, correlation, size, or request-state issues. Repair or resync the original, then rescan. A corrected file is considered again. Repeated responses with the same native ID and answers are deduplicated. Reusing the ID with different answers is quarantined.
- Review conflicts explicitly. To compare the current data, export the private working form. Keeping current values dismisses the conflicting response. Using incoming answers applies them and rechecks the record, including any independent verification affected by changed values.
- The worker uses a local SQLite database for pinned definitions, private prefilled forms and histories, request associations, receipts, inbox diagnostics and execution attempts. Use a private local directory on one computer. Set `--state` or `VERAFLOW_WORKFLOW_HOME` for isolation. The default is the user’s VeraFlow Workflows state directory. Back up or remove the state directory after stopping the worker. Treat the database and original response files as private, and use your OS’s storage encryption if needed. The worker keeps these records until you remove the local store.
- **Pause autofill** stops one workflow across revisions. **Stop all autofill** stops destination execution across the store. The inbox continues processing. The worker suspends new destination attempts if the configured response folder is unavailable.
- A transient failure before writing can retry with bounded exponential backoff. A browser interruption after a possible write, a failed readback, or a worker that stopped while an attempt was running requires review. Confirm the previous result before explicitly retrying. Exactly-once execution depends on the destination and is unavailable here. After restart, previously autofilled instances stay marked for review, but their browser windows may need a fresh, explicitly acknowledged attempt.
- The dashboard binds to loopback, checks the host and request origin, and requires a per-worker key for data and changes. The browser adapter opens an isolated context and intercepts requests to serve only the bundled fictional page. It checks page identity, uses labels, verifies field values, and leaves the page open for review. The milestone includes no real-site logins, multipage navigation, API providers, or unattended browser submissions.

## CLI and adapter development

Run `scripts/veraflow --help` for the command catalog. The dashboard and CLI run the same engine. The worker reports its control URL at startup. Mutations return JSON, apart from `workflow-working-form`, which returns the editable VeraFlow document. Inbox quarantine, conflicts, an unavailable scan directory, and verification mismatch use exit status 2. Other command errors use exit status 1. Add `--json-errors` for machine-readable diagnostics.

```sh
demo=examples/source/collection
scripts/veraflow workflow-add "$demo/employment-workflow.json5" "$demo/employment.vf"
scripts/veraflow workflow-create employment-intake
scripts/veraflow workflow-status
scripts/veraflow workflow-pause employment-intake on
scripts/veraflow workflow-stop on
```

An adapter implements the provider-neutral contract in [provider.ts](../src/workflow/provider.ts) or [destination.ts](../src/workflow/destination.ts). A future collection adapter should receive only the native public request and return files that pass the native response parser. A destination adapter receives the pinned destination configuration and validated record. Use explicit page identity and expected field IDs, check permission before writes, and classify an interrupted write or failed readback as uncertain. Keep provider credentials and secrets in their own local configuration. Never put final submission in an autofill adapter.

The browser tests can exercise the published Google adapter without live calls. Set `VERAFLOW_INTEGRATIONS_TEST_CHECKOUT` to an absolute checkout of [VeraFlow Integrations v0.1.0](https://github.com/iandorsey00/veraflow-integrations/tree/v0.1.0) before running `npm run test:ui -- workflow-automation`. Its test doubles create a questionnaire and export a simulated submission through the actual adapter code. Use a private Google Forms and Drive account for any future live smoke test.

## Experiment 11 live acceptance

The operator confirmed the end-to-end workflow with VeraFlow Integrations 0.1.0, live Google Forms and a Drive-synchronized directory. The worker correlated responses, applied nonconflicting answers and configured exact-match transformations, and held the record until independent verification. The first destination run filled and checked five fields with zero mismatches. The browser stayed open for review and no final submission occurred.

The operator also confirmed repeat scans and a renamed duplicate did not cause another execution. A response that arrived while the worker was stopped was processed after restart. The global kill switch held queued work until autofill was reenabled. The two respondents' records stayed separate. The operator confirmed the second destination's visible values. Its internal readback report was unavailable for release review.

The live kill-switch check covered queued execution. Interruption of an already-running browser operation and other failure scenarios were outside the reported live acceptance. The automated suites separately cover simulated Google response exports, correlation and restart recovery, pause and queue transitions, and browser layout and readback faults.

The worker currently runs from a source checkout. Google Forms creation, publication and closure are manual. The adapter targets the bundled fictional employment page. Arbitrary website URLs and multipage navigation are outside this release. Transformations use configured exact-match rules. Historical responses with no associated instance are quarantined in the inbox history and their original files stay in place.
