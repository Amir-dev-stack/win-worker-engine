# WIN LLM execution safety — implementation note

Date: 2026-11-05  
Status: isolated execution wrapper and tests on the Stage 1 draft branch.

## Added

- One-attempt execution wrapper that selects only a provider already approved by the versioned provider policy.
- Request validation before adapter invocation and response validation after completion.
- Per-request timeout using an abort signal passed to cooperative adapters.
- Timeout and transport exceptions are classified as uncertain outcomes.
- Uncertain outcomes are never automatically replayed. A timeout does not prove that a provider did not process or bill the request.
- Missing adapters and invalid responses fail closed.
- Retry permission is surfaced only for a validated provider response explicitly classified as retryable; this wrapper itself never performs a retry.

## Important integration boundary

This wrapper is not yet connected to the production OpenAI Agents SDK path. The current live path remains in ai.mts / agents-sdk.mts and continues to use its existing budget reservation and settlement logic. Before production integration, the caller must create a budget reservation, pass its ID into the request, settle actual usage on success, and retain/mark uncertain reservations conservatively on timeout or lost responses. Provider-side spending controls remain necessary; the local budget is not a hard provider cap.

The timeout wrapper cannot forcibly stop a provider that ignores AbortSignal. It stops waiting, signals cancellation, and records the result as uncertain. No automatic fallback is attempted because a timed-out request may already have been processed or billed.

## Tests

Synthetic adapter tests cover approved routing, response validation, timeout cancellation, uncertain transport errors, no automatic replay, and missing adapters. No network provider is called.
