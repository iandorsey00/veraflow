# VeraFlow Web handoff for offline collection

The offline questionnaire implementation is now in [VeraFlow Web](../apps/web/README.md). It builds directly from the shared repository core. The sections below preserve the design and acceptance requirements for the integration.

Desktop now generates minimal requests from the active native form or step. Web should turn a request into a standalone questionnaire that produces a compatible response. Keep the existing full-form exporter available.

## Shared contract

Use the [v1 exchange specification](record-interoperability.md#exchange-v1) and the [fictional employment fixture](../examples/source/collection/). Use the Desktop `v0.26.0` source tag as the baseline, and record its resolved commit SHA and version in Web's `vendor/veraflow/revision.json`.

If Web vendors the complete record core, include `collection.ts`, `exchange-json.ts`, `gaps.ts`, `interoperability.ts`, `record-state.ts`, and their updated `candidates.ts`, `form.ts`, `model.ts`, `session.ts`, `source.ts`, and `source-record.ts` dependencies. Verify export-bundle compatibility and update the existing Desktop integration patch if required. The essential questionnaire boundary is `readCollectionRequest` and `createCollectionResponse`. An independent Web implementation can also use the documented exchange format and shared fixture without including the record engine in the generated file.

## Web implementation

- Add an **Open collection request…** entry that recognizes the versioned request. Preview only its supplied questions, display labels and instructions literally, and show required/optional status. Support the existing field kinds, optional blank-line cleanup, and stable option IDs.
- Export readable, self-contained HTML with the same offline workflow. Embed only the validated minimal request. Escape serialized input safely for its embedding context, then use DOM text nodes and standard form properties. Include no network calls, tracking, source templates, known values, private record metadata, or credentials.
- Download a strict JSON response with the request ID, a generated response ID, and the answered field IDs. Omit unanswered optional fields by default. Do not add verification, approval, or identity claims. Preserve the IDs used to retry the same download. Generate a new response ID only for a new submission.
- Use existing keyboard and accessibility patterns. Keep English and Simplified Chinese interface text in sync; display authored labels as provided. Keep any hosted or synced adapter external to the questionnaire.

## Acceptance

1. Run the fixture commands in the [Desktop walkthrough](record-interoperability.md#cli-and-veradata-example) up to making the request.
2. Import the request into Web, export HTML, open the HTML offline with a restrictive content-security policy, and answer in Mandarin. Download the response and pass it unchanged to Desktop's `collection-review` or the Record tools importer.
3. Confirm only the requested fields were embedded. Test a Boolean, a stable choice ID, optional omission, multiline cleanup, tampered or duplicate JSON, authored HTML-like labels, and correlation with an unrelated working record.
4. Rerun the full-form renderer fixtures against current Web and the newly pinned Desktop core before release. Test that any private prefilled file opened in Web exposes its metadata only where explicitly intended, and that Web's reusable exports strip private `recordState` as well as responses and verification.

Staged requests intentionally do not embed a copy of the originating template's conditions. After applying a controller answer, Desktop reevaluates the form and can create the next request. Keep that boundary until a versioned conditional questionnaire contract exists.
