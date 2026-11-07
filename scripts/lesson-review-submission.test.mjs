import test from "node:test";
import assert from "node:assert/strict";
import { lessonReviewSubmissionId } from "../netlify/lib/lesson-review-submission.mts";

test("identical lesson revision submissions share one deterministic review-case ID", () => {
  const snapshot = {
    lessonId: "lesson-42",
    validationStatus: "candidate_for_validation",
    validationReviewCaseId: "",
    updatedAt: "2026-11-06T00:00:00.000Z",
    validatedAt: ""
  };
  assert.equal(lessonReviewSubmissionId(snapshot), lessonReviewSubmissionId({ ...snapshot }));
  assert.match(lessonReviewSubmissionId(snapshot), /^lesson-review-[a-f0-9]{64}$/);
});

test("a rejected or otherwise revised lesson can create a new review-case identity", () => {
  const base = {
    lessonId: "lesson-42",
    validationStatus: "pending_independent_review",
    validationReviewCaseId: "lesson-review-old",
    updatedAt: "2026-11-06T00:00:00.000Z",
    validatedAt: ""
  };
  const rejected = { ...base, validationStatus: "rejected_by_reviewer" };
  const revised = { ...rejected, updatedAt: "2026-11-06T01:00:00.000Z" };
  assert.notEqual(lessonReviewSubmissionId(base), lessonReviewSubmissionId(rejected));
  assert.notEqual(lessonReviewSubmissionId(rejected), lessonReviewSubmissionId(revised));
});
