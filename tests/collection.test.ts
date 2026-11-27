import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyCollectionResponse,
  closeCollection,
  collectionQuestions,
  createCollectionResponse,
  prepareCollectionRequest,
  readCollectionRequest,
  readCollectionResponse,
  rememberCollection,
  reviewCollectionResponse,
} from "../src/core/collection";
import { recordGaps } from "../src/core/gaps";
import {
  applyTransformations,
  mapSourceRecord,
  planTransformations,
  readReviewedRecord,
  validatedRecord,
} from "../src/core/interoperability";
import { defaultComparison } from "../src/core/model";
import { recordHistory } from "../src/core/record-state";
import {
  applyRecordChanges,
  beginReverification,
  prepareSections,
  prepareWorkflow,
  startSession,
  verify,
} from "../src/core/session";
import { sourceDefinitionText } from "../src/core/source";
import {
  planRecordValues,
  prefilledContent,
  readRecordInput,
  recordValues,
} from "../src/core/source-record";

const fixture = (file: string) =>
  readFileSync(
    new URL(`../examples/source/collection/${file}`, import.meta.url),
    "utf8",
  );
const scope = { outputId: "main" };
const form = fixture("employment.vf");
const session = (content = form) => {
  const s = startSession({
    id: "employment",
    name: "Employment intake / 就业信息采集",
    folder: "",
    content,
    placeholderStyle: "source",
    fieldOrder: [],
    verificationEnabled: false,
    comparison: defaultComparison,
  });
  s.unifiedForm = true;
  prepareWorkflow(s, true);
  return s;
};
const employed = () => {
  const s = session();
  applyRecordChanges(
    s,
    planRecordValues(
      s,
      mapSourceRecord(
        fixture("veradata-selection.json"),
        fixture("veradata-mapping.json"),
      ),
    ),
    { source: "mapped" },
  );
  return s;
};
const responseJSON = (
  requestId: string,
  fields: object,
  responseId = crypto.randomUUID(),
) =>
  JSON.stringify({
    format: "veraflow-collection-response",
    version: 1,
    requestId,
    responseId,
    fields,
  });

test("gaps share branch evaluation and distinguish omitted, null, intentional empty and default", () => {
  const s = employed();
  const baseline = recordGaps(s, scope);
  assert.deepEqual(
    new Set(baseline.known),
    new Set(["full_name", "employment_status", "employer"]),
  );
  assert.deepEqual(baseline.missingRequired, ["job_title"]);
  assert.deepEqual(baseline.missingOptional, ["comments"]);
  assert.deepEqual(
    baseline.fields.find(({ id }) => id === "comments")?.presence,
    "omitted",
  );

  const unknown = recordGaps(
    s,
    scope,
    new Map([
      ["employment_status", null],
      ["comments", ""],
    ]),
  );
  assert.deepEqual(unknown.unresolvedConditions, ["employment_status"]);
  assert.deepEqual(unknown.missingRequired, ["employment_status"]);
  assert.deepEqual(
    new Set(unknown.deferred),
    new Set([
      "employer",
      "job_title",
      "incorporated",
      "business",
      "registration",
      "seeking_role",
    ]),
  );
  assert.equal(
    unknown.fields.find(({ id }) => id === "employment_status")?.presence,
    "null",
  );
  assert.equal(
    unknown.fields.find(({ id }) => id === "comments")?.presence,
    "empty",
  );
  assert.deepEqual(
    collectionQuestions(session(), scope).gaps.fields.find(
      ({ id }) => id === "employment_status",
    )?.presence,
    "default",
  );
  assert.equal(
    recordGaps(session(prefilledContent(session())), scope).fields.find(
      ({ id }) => id === "employment_status",
    )?.presence,
    "default",
  );

  const independent = recordGaps(
    s,
    scope,
    new Map([
      ["employment_status", "self_employed"],
      ["business", "Fictional shop"],
    ]),
  );
  assert.deepEqual(independent.unresolvedConditions, ["incorporated"]);
  assert.deepEqual(independent.deferred, ["registration"]);
  const incorporated = recordGaps(
    s,
    scope,
    new Map([
      ["employment_status", "self_employed"],
      ["incorporated", "true"],
    ]),
  );
  assert.deepEqual(
    new Set(incorporated.missingRequired),
    new Set(["business", "registration"]),
  );
  const unemployed = recordGaps(
    s,
    scope,
    new Map([["employment_status", "unemployed"]]),
  );
  assert.deepEqual(
    new Set(unemployed.missingOptional),
    new Set(["seeking_role", "comments"]),
  );
  assert.ok(unemployed.ready);
  const invalid = recordGaps(
    s,
    scope,
    new Map([["employment_status", "unknown"]]),
  );
  assert.deepEqual(invalid.invalid, ["employment_status"]);
  assert.deepEqual(invalid.unresolvedConditions, ["employment_status"]);
  const pending = recordGaps(
    s,
    scope,
    new Map([
      ["job_title", "Architect"],
      ["employer", null],
    ]),
  );
  assert.deepEqual(pending.missingRequired, ["employer"]);
  assert.deepEqual(pending.pendingVerification, ["job_title"]);
});

test("collection is minimal; responses are correlated, reversible in review, deduplicated and revision-bound", async () => {
  const initial = employed();
  const questions = collectionQuestions(initial, scope).questions;
  const { request, link } = await prepareCollectionRequest(
    initial,
    scope,
    questions,
  );
  const requiredOnly = await prepareCollectionRequest(
    initial,
    scope,
    questions.filter(({ required }) => required),
  );
  rememberCollection(initial, link);
  rememberCollection(initial, requiredOnly.link);
  const serialized = JSON.stringify(request);
  assert.deepEqual(
    readCollectionRequest(serialized).questions.map(({ id }) => id),
    ["job_title", "comments"],
  );
  assert.deepEqual(
    requiredOnly.request.questions.map(({ id }) => id),
    ["job_title"],
  );
  assert.doesNotMatch(
    serialized,
    /Xiaoming|Juniper|employment_status|software|revision|scope/,
  );

  const reopen = session(prefilledContent(initial));
  const response = readCollectionResponse(
    JSON.stringify(
      createCollectionResponse(
        request,
        readRecordInput(fixture("answers.json")),
      ),
    ),
  );
  await assert.rejects(
    reviewCollectionResponse(employed(), response),
    /collectionUnknown/,
  );
  assert.equal(
    (await reviewCollectionResponse(reopen, response)).status,
    "review",
  );
  await assert.rejects(
    reviewCollectionResponse(
      reopen,
      readCollectionResponse(
        responseJSON(request.requestId, { comments: "omitted required" }),
      ),
    ),
    /collectionRequired/,
  );
  await assert.rejects(
    reviewCollectionResponse(
      reopen,
      readCollectionResponse(
        responseJSON(request.requestId, {
          job_title: "Architect",
          full_name: "Other",
        }),
      ),
    ),
    /collectionUnexpected/,
  );
  await assert.rejects(
    reviewCollectionResponse(
      reopen,
      readCollectionResponse(
        responseJSON(request.requestId, { job_title: "A\nB" }),
      ),
    ),
    /recordInvalidField/,
  );
  assert.throws(
    () =>
      readCollectionResponse(
        responseJSON(request.requestId, {}).replace(
          '"fields":{}',
          '"fields":{"job_title":"a","job_title":"b"}',
        ),
      ),
    /invalidCollectionResponse/,
  );
  assert.throws(
    () =>
      readCollectionResponse(
        responseJSON(request.requestId, { job_title: { verify: true } }),
      ),
    /invalidCollectionResponse/,
  );
  const modified = session(
    prefilledContent(reopen).replace("fictional record", "modified record"),
  );
  await assert.rejects(
    reviewCollectionResponse(modified, response),
    /collectionStale/,
  );
  const switched = structuredClone(reopen);
  applyRecordChanges(
    switched,
    planRecordValues(switched, new Map([["employment_status", "unemployed"]])),
  );
  await assert.rejects(
    reviewCollectionResponse(switched, response),
    /collectionInapplicable/,
  );

  applyRecordChanges(
    reopen,
    planRecordValues(reopen, new Map([["job_title", "Local title"]])),
  );
  const conflict = await reviewCollectionResponse(reopen, response);
  assert.equal(conflict.status, "review");
  if (conflict.status !== "review") throw Error("expected review");
  assert.equal(conflict.changes[0].previous, "Local title");
  assert.equal(recordValues(reopen).get("job_title"), "Local title");
  await applyCollectionResponse(reopen, response, new Set(["comments"]));
  assert.equal(recordValues(reopen).get("job_title"), "Local title");
  assert.equal(recordValues(reopen).get("comments"), "可以远程办公。");
  const saved = session(prefilledContent(reopen));
  assert.equal(
    await applyCollectionResponse(saved, response, new Set(["job_title"])),
    "duplicate",
  );
  assert.equal(recordValues(saved).get("job_title"), "Local title");
  assert.doesNotMatch(
    sourceDefinitionText(prefilledContent(saved)),
    /recordState|Local title|可以远程办公/,
  );

  const clear = readCollectionResponse(
    responseJSON(request.requestId, {
      job_title: "Local title",
      comments: null,
    }),
  );
  const match = await reviewCollectionResponse(saved, clear);
  assert.equal(match.status, "review");
  if (match.status !== "review") throw Error("expected review");
  assert.deepEqual(match.matching, ["job_title"]);
  await applyCollectionResponse(saved, clear, new Set());
  assert.equal(recordValues(saved).get("comments"), "可以远程办公。");
  closeCollection(saved, requiredOnly.request.requestId);
  await assert.rejects(
    reviewCollectionResponse(
      saved,
      readCollectionResponse(
        responseJSON(requiredOnly.request.requestId, {
          job_title: "Architect",
        }),
      ),
    ),
    /collectionClosed/,
  );
});

test("reviewed transformations retain Mandarin and source, revoke verification and change the validated fingerprint", async () => {
  const s = employed();
  const prepared = await prepareCollectionRequest(
    s,
    scope,
    collectionQuestions(s, scope).questions,
  );
  rememberCollection(s, prepared.link);
  const response = readCollectionResponse(
    JSON.stringify(
      createCollectionResponse(
        prepared.request,
        readRecordInput(fixture("answers.json")),
      ),
    ),
  );
  await applyCollectionResponse(
    s,
    response,
    new Set(["job_title", "comments"]),
  );
  await assert.rejects(validatedRecord(s, scope), /recordNotReady/);
  s.active = s.fields.findIndex(({ name }) => name === "job_title");
  beginReverification(s);
  assert.equal(verify(s, "软件架构师", false), true);
  const original = await validatedRecord(s, scope);
  assert.equal(original.fields.job_title, "软件架构师");
  assert.equal("history" in original, false);
  const changes = planTransformations(s, fixture("translation.json"));
  assert.equal(recordValues(s).get("comments"), "可以远程办公。");
  applyTransformations(s, changes);
  assert.equal(s.fields[s.active].status, "captured");
  assert.throws(
    () => planTransformations(s, fixture("translation.json")),
    /transformationStale/,
  );
  await assert.rejects(validatedRecord(s, scope), /recordNotReady/);
  beginReverification(s);
  assert.equal(verify(s, "Software Architect", false), true);
  const reopened = session(prefilledContent(s));
  const history = recordHistory(reopened.recordState, "comments");
  assert.deepEqual(history?.origin, {
    source: "collection",
    requestId: response.requestId,
    responseId: response.responseId,
  });
  assert.deepEqual(history?.transformations, [
    {
      kind: "translation",
      from: "可以远程办公。",
      to: "Available to work remotely.",
    },
  ]);
  assert.match(prepareSections(reopened)[0].text, /Title: Software Architect/);
  const result = await validatedRecord(reopened, scope, true);
  assert.notEqual(result.fingerprint, original.fingerprint);
  assert.equal(result.fields.comments, "Available to work remotely.");
  assert.equal(
    (await readReviewedRecord(JSON.stringify(result))).fingerprint,
    result.fingerprint,
  );
  await assert.rejects(
    readReviewedRecord(
      JSON.stringify({
        ...result,
        fields: { ...result.fields, comments: "changed" },
      }),
    ),
    /invalidReviewedRecord/,
  );
});

test("source mapping rejects ambiguous records and never traverses inherited members", () => {
  const selection = JSON.parse(fixture("veradata-selection.json"));
  selection.records.push(selection.records[0]);
  assert.throws(
    () =>
      mapSourceRecord(
        JSON.stringify(selection),
        fixture("veradata-mapping.json"),
      ),
    /recordMappingAmbiguous/,
  );
  assert.throws(
    () => mapSourceRecord('{"x":1,"x":2}', fixture("veradata-mapping.json")),
    /invalidRecordMapping/,
  );
  const mapping =
    '{"format":"veraflow-record-mapping","version":1,"fields":{"__proto__":{"path":["constructor"],"required":true}}}';
  assert.throws(() => mapSourceRecord("{}", mapping), /recordMappingMissing/);
  const result = mapSourceRecord(
    '{"constructor":"literal","foo":null}',
    mapping,
  );
  assert.equal(result.get("__proto__"), "literal");
  assert.equal(
    Object.getPrototypeOf(Object.fromEntries(result)),
    Object.prototype,
  );
});
