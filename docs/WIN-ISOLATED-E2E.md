# WIN isolated end-to-end validation

Run the complete isolated learning lifecycle with:

```sh
node --experimental-strip-types --test scripts/win-learning-e2e.test.mjs
```

The test exercises the real production service functions for saving a pending WIN forecast, matching and settling a completed fixture, submitting the result for independent review, applying the reviewed coupon outcome, creating a post-match diagnostic candidate, and independently reviewing that lesson.

Isolation guarantees:

- The test installs a process-local in-memory store through `WIN_STORE_TEST_MODE=1`. The production store continues to use Netlify Blobs and does not load its adapter unless the test-only store has not been installed.
- The test replaces global `fetch` with two explicit stubs: an OpenLigaDB fixture response and an empty Google News RSS response. Any other host or route throws and fails the test.
- The test does not invoke Netlify endpoints, write to production Blob collections, execute AI, access bookmaker accounts, or create a real wager.
- A lesson remains a candidate after the coupon result review. It becomes independently validated only after a second reviewer credential supplies distinct-host HTTPS corroboration and passes both lesson checks.
- The synthetic fixture is not evidence of predictive performance, accuracy, ROI, or real-world learning progress.

The GitHub validation workflow runs this test alongside the existing pure settlement unit tests and architecture quality gates.
