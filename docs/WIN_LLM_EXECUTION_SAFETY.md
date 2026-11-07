# WIN LLM execution safety and provider policy

Date: 2026-11-06  
Status: governed execution path implemented on the WIN roadmap branch; live provider execution remains disabled pending owner approval.

## Execution path

The existing worker uses the versioned `win.llm.v1` execution policy rather than calling the Agents SDK directly. The governed path:

1. Checks the owner-controlled AI spending gate and creates a bounded budget reservation.
2. Builds a versioned request carrying task, run and agent identity; provider allowlist; model; capabilities; privacy classification; output/tool limits; timeout; and reservation identity.
3. Selects only an enabled, approved, price-verified provider compatible with the request.
4. Invokes the dedicated OpenAI Agents SDK adapter.
5. Validates provider identity, approved model, response contract and observed output-token usage.
6. Settles observed token and search usage on a known completion. For timeout, transport failure or another uncertain outcome, it conservatively retains the reservation.
7. Never automatically replays an uncertain request.

## Runtime and privacy limits

- One provider attempt per execution; retries are surfaced only when a validated provider response explicitly permits them.
- Execution is bounded by a 90-second timeout and passes cooperative cancellation to the adapter.
- The adapter currently supports text output and optional web search only. Unsupported structured output and unsupported tool families fail closed.
- The SDK receives the requested output-token cap. Completed responses exceeding the cap or using an unapproved model are rejected.
- Response storage is disabled with `store: false`; automatic trace export remains disabled.
- Web-search calls are counted and checked after the SDK run. This detects and accounts for overruns; it is not a provider-enforced cap on tool execution.

## Spending boundary

- `WIN_AI_BUDGET_APPROVED` remains owner-controlled and spending remains locked by default.
- The application budget is an estimate, not a hard provider billing cap. Before any live activation, the owner must verify provider-side spending limits and alerts, auto-recharge settings, key scope and rotation.
- No real provider call, paid AI execution, budget unlock, new paid service or production secret change is authorized by this implementation.
- Tests use fake adapters and synthetic reservations; passing tests do not prove provider billing behavior or a live connection.

## Verification

The roadmap branch CI workflow runs Node 22, `npm test` and `npm run build` with read-only repository permissions. It does not deploy or access production secrets.

The implementation and tests are maintained in:
- `netlify/lib/llm-contract.mts`
- `netlify/lib/llm-execution.mts`
- `netlify/lib/agents-sdk-adapter.mts`
- `scripts/llm-contract.test.mjs`
- `scripts/llm-execution.test.mjs`
- `scripts/agents-sdk-adapter.test.mjs`

A successful CI run verifies repository tests and build checks only. It does not authorize provider activation, spending, production deployment or betting.
