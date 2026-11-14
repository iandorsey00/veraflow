import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionProgress } from "../src/core/progress";
import { startScanner } from "../src/core/scanner";
import { defaultPreferences } from "../src/core/model";
import {
  capture,
  beginReverification,
  verify,
  skip,
} from "../src/core/session";

test("progress distinguishes captured, matched, mismatched and skipped values without changing the session", () => {
  const s = startScanner(defaultPreferences, "Booking", "Name");
  assert.equal(sessionProgress(s).next, "nextCapture");
  capture(s, "Alex", false);
  assert.equal(sessionProgress(s).matched, 0);
  assert.equal(sessionProgress(s).next, "nextCheck");
  beginReverification(s);
  verify(s, "Alexa", false);
  assert.equal(sessionProgress(s).matched, 0);
  assert.equal(sessionProgress(s).next, "nextCompare");
  verify(s, "Alex", false);
  const before = structuredClone(s);
  assert.equal(sessionProgress(s).matched, 1);
  assert.deepEqual(s, before);
  s.mode = "delivery";
  assert.equal(sessionProgress(s).next, "nextEmail");
  s.mode = "capture";
  skip(s, false);
  assert.equal(sessionProgress(s).filled, 0);
  assert.equal(sessionProgress(s).matched, 0);
  assert.equal(sessionProgress(s).skipped, 1);
});
