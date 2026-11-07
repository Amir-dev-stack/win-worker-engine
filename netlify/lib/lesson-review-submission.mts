import { createHash } from "node:crypto";

export function lessonReviewSubmissionId(input: {
  lessonId: string;
  validationStatus?: string | null;
  validationReviewCaseId?: string | null;
  updatedAt?: string | null;
  validatedAt?: string | null;
}): string {
  const revision = [
    input.lessonId,
    input.validationStatus || "candidate",
    input.validationReviewCaseId || "",
    input.updatedAt || "",
    input.validatedAt || ""
  ];
  return "lesson-review-" + createHash("sha256").update(JSON.stringify(revision)).digest("hex");
}
