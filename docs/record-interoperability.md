# Collection and reviewed records

English · [简体中文](record-interoperability.zh-CN.md)

VeraFlow uses the fields and conditions in a native form to identify what is missing. Open a form and choose **Form tools → Record tools…** to review gaps, export a collection request, import a response, review transformations, or approve a completed record. The existing **Save record as JSON…** command still exports a plain flat record.

## Try the fictional employment workflow

Open [Employment intake](../examples/source/collection/employment.vf). Fill 姓名 and 用人单位 with fictional values, and keep 就业状态 set to 在职. In **Record tools**, the required question is 职位 and the optional question is 补充说明. The request preview contains labels, instructions, and choices for the selected questions. Check the preview before sharing it.

1. Choose **Save record and export request**. VeraFlow saves the private working record under **Recently opened forms** and exports a separate public request. Keep a private prefilled copy with **Record tools → Save prefilled form** for longer projects. Recent forms have a size and count limit.
2. Use the CLI example below to turn the request and the fictional Mandarin answers into a response. Open the originating working record and choose **Import collection response…**. Review current and incoming values. Existing values are kept unless you select a replacement or clear.
3. Choose **Review transformations…** and open [translation.json](../examples/source/collection/translation.json). Select the changes you accept. The originals and their sources are available under **Field history**. Verify 职位 by comparing it with `Software Architect`.
4. Choose **Review and approve record…**. Preview the scope and values, decide whether to include origins and previous values, then approve and export. You can still prepare and copy normal outputs.
5. Run the fictional destination adapter against the approved JSON. It activates the relevant branch and compares the values it reads back. It stops before submission.

The [source directory](../examples/source/collection/) contains the form, the answers, an authored translation proposal, a VeraData mapping, and a local destination. The translation is a fictional example. VeraFlow performs no automatic translation.

### CLI and VeraData example

Run from the VeraFlow checkout after `npm ci`. Use a fresh working folder for results. The demo files contain fictional data.

```sh
demo=examples/source/collection
work=$(mktemp -d)

./scripts/veraflow map "$demo/veradata-selection.json" "$demo/veradata-mapping.json" \
  --form "$demo/employment.vf" > "$work/mapped.vf"
./scripts/veraflow gaps "$work/mapped.vf"
./scripts/veraflow collection-request "$work/mapped.vf" \
  --output "$work/private.vf" > "$work/request.json"
./scripts/veraflow collection-respond "$work/request.json" "$demo/answers.json" > "$work/response.json"
./scripts/veraflow collection-review "$work/response.json" "$work/private.vf"
./scripts/veraflow collection-apply "$work/response.json" "$work/private.vf" \
  --accept > "$work/received.vf"
./scripts/veraflow transformation-review "$demo/translation.json" "$work/received.vf"
./scripts/veraflow transformation-apply "$demo/translation.json" "$work/received.vf" \
  --accept > "$work/transformed.vf"
./scripts/veraflow gaps "$work/transformed.vf"
```

Use `--accept` after reviewing all changes. Desktop lets you accept selected changes. Keep stdout in a new file for each operation. Shell redirection can truncate a file before VeraFlow reads it. Do not redirect to an input path. To use only required questions, add `--required-only` when creating the request and remove omitted questions from the answers. Use `collection-close PRIVATE.vf --request-id ID` to produce an updated private working form with the request closed.

You can replace the synthetic export with an actual VeraData CLI export. These commands create and use a fresh fictional vault. Pass `--vault` to every VeraData command. Run the mapping above with `"$work/selection.json"` as its first input.

```sh
vd=../veradata/dist/VeraData.app/Contents/Helpers/veradata
vault="$work/Fictional vault.json"
"$vd" profile create Demo --id demo --vault "$vault"
"$vd" record add --kind contact --id contact --label 'Fictional contact' \
  --set 'name=Xiaoming Example' --vault "$vault"
"$vd" record add --kind employment --id job --label 'Fictional job' \
  --set 'employer=Juniper Example Labs' --set 'endDate=present' --vault "$vault"
"$vd" export --selection "$demo/veradata-plan.json" --vault "$vault" > "$work/selection.json"
```

The example mapping interprets the explicit `Present` source value for this demo. It does not infer employment status from arbitrary records.

Open `transformed.vf` in Desktop and verify the final title. Save a private prefilled copy if you want to run `record-export` on it. For **human approval**, use Desktop's review dialog and save the resulting file as `approved.json` in the working folder. The machine export does not include approval.

```sh
./scripts/veraflow record-inspect "$work/approved.json"
node --import tsx "$demo/run-destination.mjs" "$work/approved.json"
```

The adapter requires Playwright Chromium. Run `npx playwright install chromium` from the source checkout if needed. It targets only the example page and accepts either a compatible flat record or a reviewed envelope. A real destination adapter handles its own authentication, target selection, and submission policy. Keep destination readback separate from VeraFlow's field verification.

## Exchange v1

These rules define the exchange independently of the Desktop UI. New public inputs use strict UTF-8 JSON. Desktop accepts a leading UTF-8 BOM. Duplicate keys, unsupported versions, unexpected envelope properties, excessive sizes and nesting, and NUL characters in field values are rejected. Requests, responses, mappings and proposals are limited to 1 MiB and 12 JSON levels. Reviewed record inspection accepts up to 4 MiB. Field IDs are exact, case-sensitive nonblank strings of up to 1,024 characters without control characters or line separators. Request and response IDs match `[A-Za-z0-9_-]{16,128}`. VeraFlow generates UUIDs. IDs correlate data and do not authenticate the respondent.

### Gap analysis

`veraflow-gaps` v1 carries `scope`, `ready`, and the arrays `known`, `missingRequired`, `missingOptional`, `inapplicable`, `invalid`, `pendingVerification`, `unresolvedConditions`, `deferred`, and `fields`. Each field has `id`, `presence`, `status`, and `pendingVerification`. Presence is `omitted`, `null`, `empty`, `default`, or `value`. Omitted input retains prefilled values or inherits a default. Null clears the value and suppresses its default. An explicit empty string can be an intentional answer where the field permits it. Invalid supplied values are reported per field. An unknown input field is included in `invalid`.

Scope is `{"outputId":"main"}` or `{"step":0}` with a zero-based step index. The shell flag `--step` is one-based. Scoped gaps include referenced fields and form-wide record-only fields, or the step's explicitly visible fields. An unknown or invalid controlling value defers its branch fields. Explicit empty text can resolve a blank test. Applicable defaults participate, including the first option for a radio or dropdown without an authored default. Resolve an unknown controller, apply the response, and analyze again. Normal rendering and existing `validate` keep their behavior. `ready` describes the record in scope. Final rendering can still reject missing runtime context such as clipboard text.

### Collection request and response

```json
{
  "format": "veraflow-collection-request",
  "version": 1,
  "requestId": "12345678-example-request",
  "questions": [
    {
      "id": "job_title",
      "label": "职位",
      "instructions": "请填写现任职位。",
      "type": "text",
      "required": true
    },
    {
      "id": "comments",
      "label": "补充说明",
      "type": "textarea",
      "required": false,
      "multiline": true,
      "allowBlankLines": false
    }
  ]
}
```

A request has one to 1,000 unique questions. Each requires `id`, `label`, `type`, and Boolean `required`. `instructions` is optional. Text and textarea may include Boolean `multiline` and `allowBlankLines`. Supported types are text, textarea, email, date, number, Boolean (`boolean`), radio and dropdown. The three choice types require one to 100 unique `options`, each with a stable ASCII `id` and nonblank `label`. Boolean choices have IDs `true` and `false`. Option labels are for display. Send the stable IDs. Authored field labels and instructions are used as written.

```json
{
  "format": "veraflow-collection-response",
  "version": 1,
  "requestId": "12345678-example-request",
  "responseId": "12345678-example-response",
  "fields": { "job_title": "软件架构师", "comments": "可以远程办公。" }
}
```

Responses use a flat `fields` object of strings or null. Dates use `YYYY-MM-DD`, numbers use decimal text, and choices, including Boolean choices, use their IDs as strings. Optional `submittedAt` is UTC ISO 8601 with milliseconds and `Z`. It is advisory. Required answers must be nonblank. Optional omitted members leave the working record alone. Explicit null requests a clear, which requires review for an existing value. Inapplicable, unexpected, invalid, stale, and uncorrelated responses cannot be applied.

The private prefilled form stores the request's scope, revision, field IDs, and processed response IDs. Use the latest saved copy of that working record. Multiple requests can coexist. The app keeps up to 32 request entries per record and up to 32 processed response IDs per request. A closed entry may be removed when a new request needs space. Reimporting a processed response does not apply it twice. Duplicates in an old or forked working copy are tracked by that copy. To recover from an interrupted export, reopen the saved private record and create a new request or close the earlier one. Requests are exported files. Hosting, transmission, and respondent authentication are the responsibilities of a separate adapter.

### Source mapping

`veraflow-record-mapping` v1 has a `fields` object with one rule per destination field. Every rule includes a `path` array of up to 12 exact property names. Numeric path segments index arrays. An optional `select` object contains a `path` to an array and a nonempty `where` object with exact scalar comparisons against direct members of each row. Zero matches leaves the value missing, unless `required: true`; multiple matches fail. A rule can apply a `values` dictionary, keyed by the string representation of a non-null source scalar. A missing conversion fails explicitly. Source null remains null. Objects, arrays, and unsafe integer magnitudes cannot become output values. Quote exact numeric identifiers in the source. Mapping emits strings or null, executes no code, and traverses only own properties.

### Transformations, provenance and approval

`veraflow-transformations` v1 has a `fields` object keyed by field ID. Each proposal contains `kind` (a lowercase identifier such as `translation`), exact current string `from`, and nonblank string `to`. The proposal must still match the current value when reviewed. An accepted change preserves the original origin and records the before and after values, up to eight accepted transitions including the original one. Changing a value invalidates its verification and any affected prepared output. A new source replacement is a new provenance entry. Importing a response or proposal cannot assert verification.

Provenance lives in optional private `recordState` version 1 in a prefilled file. Existing files have no invented history. Sources include manual entry, JSON, CSV, mapping, accepted candidates, capture, collection, authored defaults, or an accepted transformation. Reusable definition exports strip current responses, verification, collection state and history. Keep private prefilled copies and enriched exports local unless you deliberately share them. History can contain original private values and correlation IDs. It never adds whole source documents, file paths or evidence quotes.

`veraflow-reviewed-record` v1 contains the form `revision` digest, `scope`, `validation: "complete"`, `verification: "requirements-met"`, applicable known `fields`, a `verified` array of field IDs, and a SHA-256 `fingerprint`. Optional `history` includes the selected field provenance. Desktop approval adds `approval: {"at":"…","fingerprint":"…"}` for that exact snapshot. An independent reader can recompute the fingerprint from the UTF-8 of JSON encoding `{revision, scope, fields, verified, history}`, omitting absent history, sorting object keys lexicographically by UTF-16 at each level, and using ECMAScript JSON serialization (including numeric object key ordering). Preserve array order. A digest can detect a changed snapshot, and a later record or template revision must be reviewed again. The envelope isn't a signature, a statement of factual accuracy, or proof of submission to a destination.

Existing VeraFlow flat records, candidate exchange, source definitions, and prefilled files remain readable. Older apps may reject the new private header. For them export the reusable definition and a separate flat record. Keep the newest private copy if you intend to continue a collection.
