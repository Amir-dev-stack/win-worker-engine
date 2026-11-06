import test from "node:test";
import assert from "node:assert/strict";
import { isStrictIsoTimestamp, parseStrictIsoTimestamp } from "../netlify/lib/strict-timestamp.mts";

test("strict timestamp accepts valid UTC and offset-qualified instants", () => {
  for (const value of [
    "2024-02-29T12:00:00Z",
    "2026-11-06T18:30:45.123Z",
    "2026-11-06T19:30:45+01:00",
    "2026-11-06T12:30:45-06:00"
  ]) {
    assert.equal(isStrictIsoTimestamp(value), true, value);
    assert.ok(Number.isFinite(parseStrictIsoTimestamp(value)), value);
  }
});

test("strict timestamp rejects impossible calendar and clock values Date.parse may normalize", () => {
  for (const value of [
    "2026-02-29T12:00:00Z",
    "2026-02-31T12:00:00Z",
    "2026-04-31T12:00:00Z",
    "2026-11-06T24:00:00Z",
    "2026-11-06T12:60:00Z",
    "2026-11-06T12:00:60Z",
    "2026-11-06T12:00:00+24:00",
    "2026-11-06T12:00:00+01:60",
    "2026-13-01T12:00:00Z",
    "2026-11-06T12:00:00"
  ]) {
    assert.equal(isStrictIsoTimestamp(value), false, value);
    assert.equal(parseStrictIsoTimestamp(value), null, value);
  }
});
