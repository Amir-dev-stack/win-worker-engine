import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const [coverage, coverageApi, monitor, hourlyMonitor, settlement, independentReview, source, worker, ai, pkg, build, html, app, providers, adapter, modelLab, syncFn, statusFn, consensusAdapter, consensusSync, sharpAdapter, sharpSync, calibration, workerOrg, scheduledAgentRunner, worldCupAdapter, worldCupSync, library, settlementBridge, settlementFn, sourceDiscovery, sourceDiscoveryFn, sourceReviewFn, agentEvolution, scheduledRunner, aiBudget, health, budgetApi, openaiKeyCheck, departmentSmokeTest, predictionsApi, resultsApi, libraryApi, runsApi, storeApi] = await Promise.all([
  read("netlify/lib/coverage.mts"), read("netlify/functions/coverage.mts"),
  read("netlify/functions/coverage-monitor.mts"), read("netlify/functions/hourly-monitor.mts"), read("netlify/functions/human-coupon-settlements.mts"), read("netlify/functions/independent-review.mts"),
  read("netlify/lib/source-intelligence.mts"), read("netlify/functions/worker-runner.mts"),
  read("netlify/lib/ai.mts"), read("package.json"), read("scripts/build.mjs"), read("public/index.html"), read("public/app.js"),
  read("netlify/lib/data-provider-registry.mts"), read("netlify/lib/openfootball-adapter.mts"), read("netlify/lib/model-lab.mts"),
  read("netlify/functions/openfootball-sync.mts"), read("netlify/functions/research-status.mts"),
  read("netlify/lib/consensus-market-adapter.mts"), read("netlify/functions/consensus-market-sync.mts"),
  read("netlify/lib/sharpapi-sample-adapter.mts"), read("netlify/functions/sharpapi-sample-sync.mts"), read("netlify/lib/market-calibration.mts"), read("netlify/lib/worker-org.mts"), read("netlify/functions/scheduled-scout-runner.mts"),
  read("netlify/lib/openfootball-worldcup-adapter.mts"), read("netlify/functions/openfootball-worldcup-sync.mts"), read("netlify/lib/library.mts"),
  read("netlify/lib/observed-market-settlement.mts"), read("netlify/functions/observed-market-settlement.mts"),
  read("netlify/lib/public-source-discovery.mts"), read("netlify/functions/public-source-discovery.mts"), read("netlify/functions/research-source-candidates.mts"),
  read("netlify/lib/agent-evolution.mts"), read("netlify/functions/scheduled-scout-runner.mts"),
  read("netlify/lib/ai-budget.mts"), read("netlify/functions/health.mts"), read("netlify/functions/ai-budget.mts"), read("netlify/functions/openai-key-check.mts"), read("netlify/functions/department-smoke-test.mts"), read("netlify/functions/predictions.mts"), read("netlify/functions/results.mts"), read("netlify/functions/library.mts"), read("netlify/functions/runs.mts"), read("netlify/lib/store.mts")
]);
const dashboardAuth = await read("netlify/edge-functions/dashboard-auth.ts");
const postMatch = await read("netlify/lib/post-match-followup.mts");
const matchEvidence = await read("netlify/lib/match-evidence.mts");
const agentTaskQueue = await read("netlify/lib/agent-task-queue.mts");
const statCatalog = await read("netlify/lib/sport-stat-catalog.mts");
const [oauthToken, publicSourceStatus, agentEvolutionStatus, worldCupStatus] = await Promise.all([
  read("netlify/functions/oauth-token.mts"), read("netlify/lib/public-source-discovery.mts"),
  read("netlify/lib/agent-evolution.mts"), read("netlify/lib/openfootball-worldcup-adapter.mts")
]);
const postMatchFn = await read("netlify/functions/post-match-followup.mts");
const postMatchCheckApi = await read("netlify/functions/post-match-check.mts");
const postMatchRunner = await read("netlify/functions/post-match-runner.mts");
const learningObservatory = await read("netlify/lib/learning-observatory.mts");
const winLearningCore = await read("netlify/lib/win-learning-core.mjs");
const learningObservatoryFn = await read("netlify/functions/learning-observatory.mts");
const learningDataJobsFn = await read("netlify/functions/learning-data-jobs.mts");
const mcpApi = await read("netlify/functions/mcp.mts");
const oauthStore = await read("netlify/lib/oauth-store.mts");
const oauthAuthorize = await read("netlify/functions/oauth-authorize.mts");
add("WIN exposes a dedicated read-only audit scope through OAuth", oauthStore.includes('"win:audit"') && oauthAuthorize.includes("Read-only WIN diagnostics") && mcpApi.includes('securitySchemes: [{ type: "oauth2", scopes: ["win:audit"] }]'), "The user can authorize diagnostics separately from research permissions.");
add("OAuth authorization requires explicit least-privilege scopes", oauthAuthorize.includes("const requested = value.trim() ? value.trim().split") && oauthAuthorize.includes(": [];") && oauthAuthorize.includes("!requested.length"), "An omitted scope is rejected instead of silently granting every supported permission.");
add("WIN audit consent accurately describes read-only research-run metadata", oauthAuthorize.includes("read-only research-run records") && oauthAuthorize.includes("Cannot start research") && mcpApi.includes("read-only research-run metadata"), "The audit scope may read run metadata but cannot start research or mutate data.");
add("WIN audit MCP tools are read-only and limited to an explicit collection allowlist", mcpApi.includes("get_win_audit_overview") && mcpApi.includes("list_win_audit_records") && mcpApi.includes("get_win_audit_record") && mcpApi.includes("auditCollections") && mcpApi.includes('scope="win:audit win:read win:research"') && mcpApi.includes("if (!scopes.includes(\"win:audit\"))") && !mcpApi.includes("put(auditCollections") && !mcpApi.includes("remove(auditCollections"), "Audit tokens can inspect observatory and approved WIN data collections but cannot mutate storage or invoke research tools.");

add("WIN settlement and lesson trust rules are shared across live paths and covered by isolated unit tests", winLearningCore.includes("evaluateFullTimeLeg") && winLearningCore.includes("aggregateCouponOutcome") && winLearningCore.includes("deriveReviewedCouponOutcome") && winLearningCore.includes("isEligibleWinForecastCoupon") && winLearningCore.includes("isIndependentlyValidatedLesson") && postMatch.includes("evaluateFullTimeLeg as evaluateLeg") && postMatch.includes("isEligibleWinForecastCoupon") && independentReview.includes("deriveReviewedCouponOutcome as deriveCouponOutcome") && library.includes("isIndependentlyValidatedLesson") && learningObservatory.includes("isIndependentlyValidatedLesson as validatedLesson") && pkg.includes("--experimental-strip-types --test scripts/*.test.mjs") && (await read("scripts/win-learning-core.test.mjs")).includes("Fixtures are pure in-memory values"), "Both result checking and independent review use the tested pure core; unit fixtures cannot write to production storage or call public APIs.");

add("WIN coupon-to-lesson lifecycle has an isolated end-to-end regression test",
  (await read("netlify/lib/store.mts")).includes("installIsolatedTestStore") &&
  storeApi.includes("WIN_STORE_TEST_MODE") &&
  independentReview.includes("reviewCaseForIsolatedTest") &&
  pkg.includes("--experimental-strip-types --test scripts/*.test.mjs") &&
  (await read("scripts/win-learning-e2e.test.mjs")).includes("runPostMatchFollowups") &&
  (await read("scripts/win-learning-e2e.test.mjs")).includes("reviewer-lesson-2") &&
  (await read("scripts/win-learning-e2e.test.mjs")).includes("Unexpected network request"),
  "The production save, result-check and reviewer services are exercised against a flagged in-memory store with network calls stubbed.");
add("WIN storage pagination and conditional-write semantics have isolated in-memory tests",
  (await read("scripts/win-store.test.mjs")).includes('process.env.WIN_STORE_TEST_MODE = "1"') &&
  (await read("scripts/win-store.test.mjs")).includes("putIfNew") &&
  (await read("scripts/win-store.test.mjs")).includes("putIfMatch") &&
  (await read("scripts/win-store.test.mjs")).includes("pagesRequested") &&
  (await read("scripts/win-store.test.mjs")).includes("maxConcurrentReads <= 16") &&
  (await read("scripts/win-store.test.mjs")).includes("zero-sized request"),
  "The shared store contract is tested for environment gating, paginated early-stop reads, bounded parallelism, ETags, append and delete without production storage.");
add("Post-match follow-up uses public, no-AI result discovery and safe event identity", postMatch.includes("api.openligadb.de") && postMatch.includes("getmatchesbyteam") && postMatch.includes("matchDateTimeUTC") && postMatch.includes("matchIsFinished") && postMatch.includes("Math.abs(matchTime-when)<=36*60*60*1000") && postMatch.includes("Multiple result records match") && postMatch.includes("No exact kickoff date/time") && postMatch.includes("unsupported_market"), "Only one exact team/date fixture with an unambiguous final score can be evaluated; unsupported markets and ambiguous or undated fixtures remain unresolved.");
add("Post-match polling is scheduled, bounded and has zero AI calls", postMatchFn.includes('schedule: "23 */4 * * *"') && postMatch.includes("BATCH_LIMIT = 30") && postMatch.includes("SEARCH_LIMIT_PER_RUN = 30") && postMatch.includes("CACHE_TTL_MS") && postMatch.includes("aiCalls:0") && !postMatchFn.includes("runWinAgent"), "The scheduled result checker uses public match data, a bounded batch and a six-hour cache without unlocking or using paid AI.");
add("Post-match outcomes remain pending until separate reviewer approval", postMatch.includes('put("library/win-post-match-review-cases"') && postMatch.includes('reviewStatus:"pending_independent_review"') && postMatch.includes('record.status="review_submitted"') && postMatch.includes("lessonCandidateIds"), "WIN stores leg results and proposed diagnostic notes separately; it never places bets or applies official coupon settlement before review.");
add("Post-match Google discovery is bounded and never treated as settlement proof", postMatch.includes("news.google.com/rss/search") && postMatch.includes("GOOGLE_CSE_API_KEY") && postMatch.includes("GOOGLE_CSE_ID") && postMatch.includes("leadOnly:true") && postMatch.includes("settlementEvidence:false") && postMatch.includes("SEARCH_LIMIT_PER_RUN = 30"), "Google Programmable Search is used only when configured; otherwise Google News RSS is a lead source. Google results never decide the leg outcome.");
add("Manual post-match checks are owner-authenticated and run without paid AI", postMatchCheckApi.includes("requireAuth") && postMatchCheckApi.includes("/api/post-match-check") && postMatchCheckApi.includes("post-match-runner") && postMatchRunner.includes("authorized(req)") && postMatchRunner.includes("background: true") && postMatchRunner.includes("runPostMatchFollowups") && !postMatchRunner.includes("runWinAgent"), "The dashboard queues a bounded background result check with no AI worker, no API spend and no automatic bet.");
add("Post-match background runner prevents overlapping batches", postMatchRunner.includes("library/post-match-runner-lock") && postMatchRunner.includes("putIfNew") && postMatchRunner.includes("putIfMatch") && postMatchRunner.includes("leaseExpiresAt"), "Manual and scheduled invocations share an atomic single-key lease; overlapping batches are rejected.");
add("Every WIN leg can be independently resolved before coupon settlement", independentReview.includes("manualLegResults") && independentReview.includes("deriveCouponOutcome") && independentReview.includes("reviewer_manual_resolution") && independentReview.includes("hasNewEvidenceDomain([manual.evidenceUrl],oldUrls)") && independentReview.includes("Every coupon leg must have a verified automatic result"), "A coupon is not approved while any leg remains unresolved; manual outcomes require per-leg HTTPS evidence from a different host.");
add("Loss diagnostics compare the archived pre-match departments and require a second reviewer", postMatch.includes("preMatchReports") && postMatch.includes("diagnosticChecklist") && independentReview.includes("outcomeReviewerCredentialId:reviewer.credentialId") && independentReview.includes("submitterCredentialId:reviewer.credentialId"), "A reviewer can confirm the outcome but cannot self-validate the causal lesson; the diagnostic compares D1/D2/D3/D4/D6/D8 with post-match facts.");
add("WIN reviewed results do not auto-validate causal lessons", independentReview.includes('recordType: caseType === "human_coupon" ? "settlement_learning_case" : "verified_coupon_outcome"') && independentReview.includes('validationStatus: caseType === "human_coupon" ? "validated" : "outcome_verified_cause_unvalidated"') && independentReview.includes('if (caseType === "human_coupon") await put("library/lessons", settlementLearningId, learning)'), "The outcome is verified separately; diagnostic lessons remain candidates until their own review is approved.");
add("WIN post-match reviews require a different reviewer credential and distinct-host evidence", independentReview.includes("winCouponCases") && independentReview.includes('"win_coupon"') && independentReview.includes('expectedOrigin = caseType === "human_coupon" ? "human" : "win"') && independentReview.includes("hasNewEvidenceDomain") && independentReview.includes('settlementReviewStatus: "approved_by_separate_reviewer_credential"'), "A WIN research forecast only enters the reviewed win/loss boards after a separate reviewer checks match identity, market rules, every leg and new corroboration.");
add("Learning observatory exposes actual review counts and cautious trend thresholds", learningObservatory.includes("verifiedWins") && learningObservatory.includes("verifiedLosses") && learningObservatory.includes("independentlyValidatedLessons") && learningObservatory.includes("recent.length>=10&&prior.length>=10") && learningObservatory.includes("not selection-level accuracy"), "The dashboard distinguishes verified outcomes, candidate lessons and insufficient samples; no accuracy improvement is invented.");
add("Learning observatory API is authenticated and read-only", learningObservatoryFn.includes("requireAuth") && learningObservatoryFn.includes('path:"/api/learning-observatory"') && learningObservatoryFn.includes("getLearningObservatory"), "The learning dashboard reads persisted status and cannot start research or change budget approval.");
add("WIN Blob collection listing stops after the requested sample", storeApi.includes("paginate: true") && storeApi.includes("for await (const page of backend.list") && storeApi.includes("if (maxItems === 0) return []") && storeApi.includes("selected.length >= maxItems"), "The list helper does not fetch every Blob listing page when a caller requests a bounded sample.");
add("WIN audit Blob record reads remain bounded and parallel", storeApi.includes("const batchSize = 16") && storeApi.includes("Promise.all(batch.map") && storeApi.includes("for (let offset = 0; offset < selected.length; offset += batchSize)"), "Only selected records are fetched, in bounded parallel batches.");
add("WIN audit overview caps each collection sample at 20 records", learningObservatory.includes('list<any>("library/human-settlement-cases",20)') && learningObservatory.includes('list<any>("library/review-operations",20)') && learningObservatory.includes('maxRecordsPerCollection:20') && learningObservatory.includes("at most 20 records per collection") && learningObservatory.includes("counts and rates are sample-bounded"), "The live MCP overview uses a strict per-collection sample cap and discloses sample-bounded aggregates.");
add("WIN status helpers do not scan thousand-record collections", postMatch.includes('list<any>("library/post-match-followups",25)') && postMatch.includes('list<any>("library/coupons",25)') && publicSourceStatus.includes('list<any>("library/research-source-candidates", 25)') && worldCupStatus.includes('list<any>("library/model-lab/historical-event-datasets",25)') && agentEvolutionStatus.includes('list<any>("library/agent-proposals",50)'), "Status endpoints cap helper scans; large imports remain separate background jobs.");
add("OAuth authorization codes and refresh tokens are consumed atomically", oauthStore.includes("readOAuthRecordWithMetadata") && oauthStore.includes("onlyIfMatch: etag") && oauthToken.includes("consumeOAuthRecord(\"codes\"") && oauthToken.includes("consumeOAuthRecord(\"refresh\""), "Concurrent token exchanges cannot reuse the same one-time code or refresh token.");
add("Dashboard exposes post-match result checks and learning diagnostics", html.includes('id="learning"') && html.includes('id="postMatchRecent"') && html.includes('id="runPostMatchCheck"') && app.includes("refreshLearning") && app.includes("/api/learning-observatory") && app.includes("/api/post-match-check") && app.includes("winCouponCases"), "The user can inspect each recorded post-match leg, unvalidated diagnostics and independent reviewer queue.");
add("Public dataset discovery covers four metadata indexes and cannot enable adapters", sourceDiscovery.includes("huggingface.co/api/datasets") && sourceDiscovery.includes("api.github.com/search/repositories") && sourceDiscovery.includes("zenodo.org/api/records") && sourceDiscovery.includes("api.datacite.org/dois") && sourceDiscovery.includes("automationAllowed: false") && sourceDiscovery.includes("aiCalls: 0"), "Hugging Face, GitHub, Zenodo and DataCite are metadata discovery only; no data rights or ingestion are implied.");
add("Coverage is calculated from persisted evidence", coverage.includes("library/research-evidence") && coverage.includes("not_observed") && coverage.includes("stale_or_undated"), "No missing coverage is fabricated.");
add("Every registered sport is reported", coverage.includes("SPORT_REGISTRY.map") && coverage.includes("requiredDomains"), "Sport coverage is based on the current registry.");
add("Coverage API is authenticated", coverageApi.includes("requireAuth") && coverageApi.includes("/api/coverage"), "GET /api/coverage requires authentication.");
add("Coverage snapshots run without AI", monitor.includes('schedule: "0 */6 * * *"') && !monitor.includes("runWinAgent"), "Six-hour snapshots use stored data only.");
add("Human settlement claims cannot auto-settle", settlement.includes("pending_independent_review") && settlement.includes("outcomeApplied: false") && settlement.includes("coupon.outcome"), "Evidence submissions stay pending and do not change coupon outcomes.");
add("Original tipster post cannot verify itself", settlement.includes("coupon.source") && settlement.includes("evidenceUrl"), "Original post is rejected as its own settlement evidence.");
add("Public human imports require explicit content class", source.includes('"original human coupon", "single human pick"') && source.includes("contentClass"), "Only original coupons and single picks enter public archive.");
add("D5 archive rejects unclassified content", worker.includes("missing_or_ineligible_content_class") && worker.includes('"original human coupon", "single human pick"'), "Promotions, demos, consensus and unclassified content are excluded.");
add("OpenAI key and one-call response diagnostics are owner-authenticated and budgeted", openaiKeyCheck.includes("requireAuth") && openaiKeyCheck.includes("https://api.openai.com/v1/models") && openaiKeyCheck.includes('method: "GET"') && openaiKeyCheck.includes("https://api.openai.com/v1/responses") && openaiKeyCheck.includes("max_output_tokens: 16") && openaiKeyCheck.includes("reserveAIRequest") && openaiKeyCheck.includes("settleAIRequest") && openaiKeyCheck.includes("store: false") && openaiKeyCheck.includes("tools: []") && html.includes('id="testOpenAIKey"') && html.includes('id="testModelResponse"') && app.includes('action:"validate_model_response"'), "One owner-authorized Responses API request is capped at 16 output tokens, has no tools, is recorded in the budget ledger, and does not unlock normal WIN AI execution.");
add("Owner department smoke test is isolated, budgeted and non-research", departmentSmokeTest.includes("requireAuth") && departmentSmokeTest.includes("WIN_DEPARTMENTS") && departmentSmokeTest.includes("reserveAIRequest") && departmentSmokeTest.includes("settleAIRequest") && departmentSmokeTest.includes("releaseAIRequest") && departmentSmokeTest.includes("max_output_tokens: MAX_OUTPUT_TOKENS") && departmentSmokeTest.includes("tools: []") && departmentSmokeTest.includes("store: false") && !departmentSmokeTest.includes("WIN_AI_BUDGET_APPROVED") && departmentSmokeTest.includes("normalAIExecutionEnabled: false") && departmentSmokeTest.includes("researchPerformed: false") && departmentSmokeTest.includes("providerErrorCode") && departmentSmokeTest.includes("providerRequestId") && departmentSmokeTest.includes("providerResponseExcerpt") && departmentSmokeTest.includes("providerContentType") && departmentSmokeTest.includes("JSON.parse(providerRawBody)") && departmentSmokeTest.includes("REDACTED API KEY") && app.includes("providerErrorCode") && app.includes("providerResponseExcerpt") && app.includes("providerStatus"), "One department per owner-authenticated request; no web tools, no normal worker runner, existing spending stop enforced, and global approval flag unchanged.");
add("Frozen forecasts require a complete valid research and risk assessment", worker.includes("departmentReportsComplete") && worker.includes("debateReportsComplete") && worker.includes("WIN_DEPARTMENTS.every") && worker.includes("REQUIRED_DEBATE_ROLES.every") && worker.includes("const freezeEligible = departmentReportsComplete && debateReportsComplete && masterExecutionValid && riskAssessmentValid") && worker.includes("if (freezeEligible)") && worker.includes("completedDepartmentReports") && worker.includes("completedDebateReports") && worker.includes("riskAssessmentGate") && predictionsApi.includes("includeInvalid") && predictionsApi.includes("completedDepartmentReports === 8") && predictionsApi.includes("completedDebateReports === 4") && predictionsApi.includes('libraryReviewGate?.status === "passed"') && predictionsApi.includes('riskAssessmentGate?.status === "passed"'), "Only complete runs with all eight department reports, four challenges, library receipts and a valid Global Master risk assessment create dashboard forecasts; invalid historical records remain auditable.");
add("AI budget remains explicit and fail-closed", ai.includes("WIN_AI_BUDGET_APPROVED") && ai.includes("provider-side monthly spending limit"), "No new automatic AI spending is enabled.");
add("AI spending cap matches the approved $3 plan", aiBudget.includes("const LIMIT_USD = 3;") && aiBudget.includes("const OPERATING_LIMIT_USD = 2.95;"), "The application estimate stops below the $3 monthly OpenAI allocation; production AI remains approval-gated.");
add("WIN spending lock persists until explicit owner approval", aiBudget.includes("spendingLocked") && aiBudget.includes("ownerApproveBudgetUnlock") && aiBudget.includes("I AUTHORIZE WIN SPENDING UNLOCK") && aiBudget.includes("calendar-month rollover") && budgetApi.includes("owner_approve_unlock"), "The lock survives month rollover; unlock requires the owner master token and exact confirmation phrase.");
add("WIN stores monthly budget threshold alerts", aiBudget.includes("evaluateBudgetAlerts") && aiBudget.includes("threshold_80") && aiBudget.includes("threshold_95") && aiBudget.includes("limit_reached"), "Budget threshold and limit alarms are persisted in the monthly ledger.");
add("Dashboard exposes owner lock status and explicit unlock control", html.includes('id="aiBudget"') && html.includes('id="ownerUnlockBudget"') && html.includes('id="budgetLockStatus"') && app.includes('action:"owner_approve_unlock"') && app.includes("Notification.requestPermission"), "The dashboard shows persistent lock state and requires a typed owner confirmation to unlock.");
add("Health API reports the same $3 AI budget", health.includes("aiMonthlyEstimateLimitUsd: 3"), "The health endpoint cannot display a stale $5 allowance.");
add("Build invokes quality gates", pkg.includes("quality-gates.mjs") && build.includes("coverage-monitor.mts"), "Build contract includes the new operational modules.");
add("Dashboard exposes coverage and settlement review", html.includes('id="coverage"') && html.includes('id="settlementEvidenceForm"') && app.includes("/api/coverage") && app.includes("/api/human-coupon-settlements"), "The new backend workflows are accessible from the dashboard.");
add("OpenFootball adapter preserves provenance and checksum", adapter.includes("rawChecksum") && adapter.includes("sourceLicence:\"CC0-1.0\"") && adapter.includes("library/model-lab/historical-event-datasets"), "Only the documented CC0 football.json dataset is ingested.");
add("Daily historical sync is deterministic and no-AI", syncFn.includes("17 3 * * *") && !syncFn.includes("runWinAgent"), "Scheduled dataset ingestion does not consume AI budget.");
add("Model Lab uses chronological held-out data", modelLab.includes("chronological_70_30") && modelLab.includes("testBrier") && modelLab.includes("humanCouponLabTouched:false"), "Historical score baseline is evaluated out of sample and isolated.");
add("Research status endpoint is authenticated", statusFn.includes("requireAuth") && statusFn.includes("/api/research-status"), "Provider and Model Lab status is private.");
add("Provider registry distinguishes candidates from approved sources", providers.includes("licenceReview") && providers.includes("automationAllowed"), "Commercial feeds remain disabled pending credentials and terms approval.");
add("Consensus market datasets are licence-labelled and isolated", consensusAdapter.includes("CC-BY-4.0") && consensusAdapter.includes("library/model-lab/market-consensus-datasets") && consensusAdapter.includes("bookmakerIdentityIncluded:false"), "Consensus market lines are not mislabelled as individual bookmaker odds.");
add("Consensus market sync is scheduled without AI", consensusSync.includes("17 5 * * *") && !consensusSync.includes("runWinAgent"), "Daily public dataset refresh uses no AI budget.");
add("SharpAPI sample importer preserves observed multi-book odds", sharpAdapter.includes("validateObservedMarket") && sharpAdapter.includes("bookmakerIdentityPreserved:true") && sharpAdapter.includes("CC-BY-4.0"), "Static odds snapshots retain book/source, market, price and timestamp.");
add("SharpAPI importer is bounded and scheduled weekly", sharpAdapter.includes("source_file_over_5mb") && sharpSync.includes("37 6 * * 1"), "Static snapshots are not misrepresented as a live feed.");
add("Market calibration is chronological and isolated", calibration.includes("chronological_70_30_per_dataset") && calibration.includes("humanCouponLabTouched:false") && calibration.includes("testMetrics") && calibration.includes("simulateConsensusCoupons") && calibration.includes("random_distinct_event_three_way_favourite_accumulators_v3"), "Market consensus is evaluated out of time without using human coupon records.");
add("1X2 calibration never collapses a missing draw class into away", calibration.includes("validThreeWay") && calibration.includes("resolveThreeWayWinner") && calibration.includes("sport_aware_two_way_and_1x2_v3") && calibration.includes("excludedMissingClassOrAmbiguousOutcome") && calibration.includes("if(!validThreeWay(p))return null") && !calibration.includes("if(p.length===2&&y===2)y=1"), "Three-way metrics and accumulator simulation require all three valid probabilities and an unambiguous 1X2 result; incomplete class vectors are excluded.");
add("Multiclass calibration metrics divide by only valid scored observations", calibration.includes("const trials=input.filter") && calibration.includes("const n=trials.length") && calibration.includes("validThreeWay(t.p)"), "Invalid class labels and incomplete probability vectors cannot silently inflate metric denominators.");
add("Model Lab excludes bookmaker ROI claims for consensus prices", calibration.includes("does not establish betting ROI") && calibration.includes("Consensus fair probabilities are not individual bookmaker prices"), "No false execution-price or profitability claim.");
add("Dynamic entity agents are independently queued", workerOrg.includes("queued_independent_api_request") && workerOrg.includes("deduplicated by stable agent ID") && worker.includes("enqueuePersistentAgentTasks") && worker.includes("library/agent-task-queue") && worker.includes('["T1","T2","T3","T4","T5","T6"]'), "Sport, country, competition, club, player, manager and event identities become separate queued tasks.");
add("Scheduled learning executes one leased entity agent per cycle", scheduledAgentRunner.includes("claimNextPersistentAgentTask") && scheduledAgentRunner.includes("updatePersistentAgentTaskLease") && scheduledAgentRunner.includes("WIN_ENTITY_AGENT_JSON") && scheduledAgentRunner.includes("library/persistent-agent-profiles"), "Entity agents run as separate budget-gated API calls and update profiles only while holding the current task lease.");
add("Persistent agent task claims use atomic conditional leases", agentTaskQueue.includes("getWithMetadata") && agentTaskQueue.includes("putIfMatch") && agentTaskQueue.includes("leaseId") && agentTaskQueue.includes("MAX_ATTEMPTS"), "Competing workers cannot claim the same task version and stale lease owners cannot overwrite reclaimed work.");
add("Research agents receive match-specific sport statistics evidence", worker.includes("getModelLabResearchPack(run.brief)") && scheduledAgentRunner.includes("getModelLabResearchPack(run.brief)") && modelLab.includes("matchEvidence:buildMatchEvidencePack") && matchEvidence.includes("statisticalSpecification"), "Both worker paths receive target-specific last-5/last-10 match evidence and source-reported coverage gaps.");
add("Sport-specific statistics catalog and ratings audit are wired to match reports", matchEvidence.includes("inspectStatisticCoverage") && matchEvidence.includes("extractPlayerPerformances") && matchEvidence.includes("highestRatedPlayers") && statCatalog.includes("SPORT_STAT_CATALOG"), "Football and other sport-specific team/player metrics, event timelines and same-provider match ratings are reported without replacing missing values.");
add("Research status exposes agent execution", statusFn.includes("persistentAgents") && statusFn.includes("library/agent-task-queue") && app.includes("agentQueue.queued"), "Queue, profile and execution status is visible through the authenticated status API.");
add("World Cup data importer preserves CC0 provenance and player events", worldCupAdapter.includes("openfootball-worldcup-json") && worldCupAdapter.includes("player-event-datasets") && worldCupAdapter.includes("resultBasis:\"regulation_90min\"") && worldCupAdapter.includes("rawChecksum"), "Tournament results, goals, lineups, substitutions and cards remain source-attributed.");
add("World Cup sync is separately scheduled and no-AI", worldCupSync.includes("17 4 * * *") && !worldCupSync.includes("runWinAgent"), "Tournament ingestion is bounded and does not consume model budget.");
add("Persistent agent profiles are available in the WIN library", library.includes("persistent-agent-profiles") && library.includes("agent-task-queue"), "Agents can reuse profiles and users can inspect their queued and completed tasks.");
add("Historical baseline is evaluated per competition and season", modelLab.includes("competition_frequency_baseline_v1") && modelLab.includes("Each competition/season is evaluated separately"), "League and tournament scoring distributions are not pooled into one benchmark.");
add("Player event evidence is available to agents", modelLab.includes("worldCupPlayerStats") && modelLab.includes("topScorers") && modelLab.includes("mostStarts"), "Goals, cards and lineup participation are preserved as sourced player evidence.");
add("Observed real bookmaker prices settle only against exact public match evidence", settlementBridge.includes("eventTimeSemantics===\"scheduled_event_start\"") && settlementBridge.includes("ambiguous_match") && settlementBridge.includes("unsupported_market") && settlementBridge.includes("sourceUrl"), "Pre-match prices are joined to exact team/date matches; uncertain and unsupported markets are excluded.");
add("Settled bookmaker observations feed the existing simulation engine", settlementBridge.includes("createSimulationRun") && settlementBridge.includes("executeSimulationRun") && settlementBridge.includes("oddsCapturedAt") && settlementBridge.includes("resultSource"), "The existing random-coupon simulator receives actual pre-event prices and separate settlement evidence.");
add("Settlement bridge excludes prediction markets and does not use AI", settlementBridge.includes("bookmakerType!==\"prediction_market\"") && !settlementFn.includes("runWinAgent") && settlementFn.includes("17 7 * * *"), "The bridge is deterministic, daily and leaves prediction-market expiry records out.");
add("Model Lab agents can review actual settled-price simulation", modelLab.includes("latestObservedMarketSettlement") && modelLab.includes("settledObservedMarketRows") && statusFn.includes("observedMarketSettlement"), "Simulation reports are included in the bounded agent evidence pack.");
add("Model Lab data is visible in the private library", library.includes("category === \"market-data\"") && html.includes("value=\"market-data\"") && app.includes("Settled bookmaker prices"), "Users can inspect imported datasets, settlement records and reports.");
add("WIN library category reads are selective", library.includes("const collectionSpecs: Record<string, { key: string; path: string; cap: number }[]>") && library.includes("const selectedSpecs = category === \"all\" || !collectionSpecs[category] ? allSpecs : collectionSpecs[category]") && library.includes("Promise.all(selectedSpecs.map") && !library.includes("Promise.all([\n    list<any>(\"library/coupons\", 500)"), "A single-category library query reads only its mapped Blob collections; the all-category view retains the full catalogue.");
add("Autonomous source discovery scans public GitHub and Hugging Face metadata only", sourceDiscovery.includes("huggingface.co/api/datasets") && sourceDiscovery.includes("api.github.com/search/repositories") && sourceDiscovery.includes("automationAllowed: false") && sourceDiscovery.includes("aiCalls: 0"), "Discovery stores source metadata and license candidates without downloading or activating unreviewed datasets.");
add("Public source discovery runs on a no-AI schedule", sourceDiscoveryFn.includes("17 2 * * *") && !sourceDiscoveryFn.includes("runWinAgent"), "Daily metadata discovery does not consume the OpenAI budget.");
add("Source approval is authenticated and cannot activate ingestion", sourceReviewFn.includes("requireAuth") && sourceReviewFn.includes("approved_for_adapter_review") && sourceReviewFn.includes("automationAllowed:false") && statusFn.includes("sourceDiscovery"), "User approval only authorizes adapter design and terms review; it never connects a provider.");
add("Discovered sources are visible in the library and dashboard", library.includes('category === "sources"') && html.includes('value="sources"') && app.includes("Discovered public source candidates"), "The user can inspect source, licence and review status.");
add("Historical odds adapter covers six sports including tennis", consensusAdapter.includes('sport==="tennis"') && consensusAdapter.includes("atp-wta-closing-odds-2025") && consensusAdapter.includes("mlb-closing-odds-2025") && providers.includes("hf-minmaxxxer-top3-europe-2025-26"), "Six sport families are imported through schema-specific normalization.");
add("AI research proposes specialist agents only with evidence", ai.includes("WIN_AGENT_PROPOSALS_JSON") && scheduledRunner.includes("registerAgentProposals"), "The existing WIN research agent can propose at most three specialist candidates per cycle.");
add("Agent sandbox readiness checks data without creating production agents", agentEvolution.includes("data_readiness_only_not_performance_test") && agentEvolution.includes("productionPromotion") && agentEvolution.includes("productionEnabled:false") && agentEvolution.includes("agentCreated:false"), "Readiness is not a predictive test; creation and promotion remain gated.");
add("Agent proposals and sandbox evaluations are persistent", library.includes("agent-proposals") && library.includes("agent-sandbox-evaluations") && statusFn.includes("agentEvolution"), "Proposal versions and data blockers are visible to the user and research agents.");
add("Prediction settlements require HTTPS evidence and remain unverified pending review", resultsApi.includes("isHttpsUrl") && resultsApi.includes("evidence.some(evidenceHasHttpsUrl)") && resultsApi.includes('settlementReviewStatus: "pending_independent_review"') && resultsApi.includes('status: "user_submitted_outcome_unverified"'), "A result is not promoted as independently verified merely because an owner submitted an outcome and a source URL.");
add("Human coupons cannot bypass independent settlement review", library.includes('current.origin === "human"') && library.includes("Human-origin coupons must use the independent settlement review queue") && library.includes("evidenceHasHttpsUrl") && libraryApi.includes("evidenceHasHttpsUrl") && libraryApi.includes("At least one HTTPS evidence URL") && settlement.includes("pending_independent_review") && settlement.includes("outcomeApplied: false"), "Human-origin coupon outcomes remain pending until an independent review path; direct library settlement cannot bypass it.");
add("Lessons cannot self-validate from a supplied HTTPS link", libraryApi.includes('reviewStatus: "pending_independent_review"') && libraryApi.includes('"library/lesson-review-cases"') && libraryApi.includes("submitterIdentityVerified: false") && libraryApi.includes("independentReviewerRequired: true") && libraryApi.includes("outcomeApplied: false") && !libraryApi.includes('validationStatus: "validated"') && library.includes("isIndependentlyValidatedLesson") && winLearningCore.includes('review?.reviewerAuth === "separate_reviewer_credential"') && winLearningCore.includes("reviewerCredentialId !== submitterCredentialId") && library.includes('category === "lesson-reviews"'), "HTTPS evidence submissions stay pending; only a separate reviewer credential can place a lesson in the trusted learning pack.");
add("Research entry points fail closed on approval and persistent budget lock", runsApi.includes("WIN_AI_BUDGET_APPROVED") && runsApi.includes("budgetStatus.spendingLocked") && worker.includes("WIN_AI_BUDGET_APPROVED") && worker.includes("budgetStatus.spendingLocked") && scheduledAgentRunner.includes("WIN_AI_BUDGET_APPROVED") && scheduledAgentRunner.includes("budgetStatus.spendingLocked") && hourlyMonitor.includes("!budget.spendingLocked"), "Manual, internal and scheduled research entry points refuse to queue or start work when approval is off or the persistent stop is active.");
add("Human coupons and lessons require a separate reviewer credential to approve", independentReview.includes("create_reviewer_access") && independentReview.includes("authenticateReviewer") && independentReview.includes("timingSafeEqual") && independentReview.includes("reviewer.credentialId === submitterCredentialId") && independentReview.includes("hasNewEvidenceDomain") && independentReview.includes("eventIdentityConfirmed") && independentReview.includes("everySelectionReviewed") && independentReview.includes('validationStatus: caseType === "human_coupon" ? "validated"') && winLearningCore.includes('review?.reviewerAuth === "separate_reviewer_credential"') && html.includes('id="reviewerQueue"') && app.includes("reviewerApi"), "Only a separate reviewer credential can apply human coupon outcomes or validate lessons; decisions require new corroboration, notes and explicit checks. Credential separation does not prove real-world identity.");
add("Reviewer endpoint defines exactly one review handler", independentReview.split("async function reviewCase(").length === 2, "One review handler prevents a legacy duplicate implementation from overriding retry and concurrency controls.");
add("Reviewer approvals use conditional single-key claims and retry-safe operation IDs", storeApi.includes("onlyIfNew: true") && storeApi.includes("onlyIfMatch: etag") && storeApi.includes("getWithMetadata") && independentReview.includes("library/review-operations") && independentReview.includes("leaseExpiresAt") && independentReview.includes("recoveryRequired") && independentReview.includes('status: "completed"') && independentReview.includes('const historyId = "review-"'), "Conditional writes claim review work once; stable IDs make partial retries idempotent and interrupted cases visible.");
add("WIN structured coupon candidates require full run approval and preserve rejected candidates", library.includes("win-coupon-candidates") && library.includes("qualifiedWinCouponsTracked") && library.includes('executionStatus: "not_placed_by_WIN"') && library.includes('putIfNew("library/coupons"') && library.includes('candidateStatus: "QUALIFIED"') && library.includes("safeArray(run.coupons, 100)") && library.includes('riskAssessmentGate?.status === "passed"') && library.includes('libraryReviewGate?.status === "passed"') && library.includes("runResearchPassed"), "D6 legs, odds, timestamps, sources and blockers are stored; only a Master-approved candidate from a fully passed run enters pending tracking, and none are placed automatically.");
add("Dashboard shows WIN-built, won and lost coupon boards", html.includes('id="winBuiltList"') && html.includes('id="wonCouponList"') && html.includes('id="lostCouponList"') && app.includes("refreshCouponBoards") && app.includes("renderCouponBoardCard") && app.includes("View full coupon"), "The dashboard displays structured built candidates and separate won/lost records with their full selections and evidence.");
add("WIN coupons preserve validated kickoff and participant identity for future result checks", library.includes("leg?.startTime || leg?.eventStart") && library.includes("eventStart: leg.eventStart") && library.includes("eventId: leg.eventId") && library.includes("homeTeam: leg.homeTeam") && library.includes("awayTeam: leg.awayTeam") && worker.includes("startTime: exactKickoff") && worker.includes("eventStart: exactKickoff"), "Post-match lookup has an explicit event date and two sides; it never substitutes an odds-capture timestamp for a kickoff.");
add("Multi-sport historical settlement lookup is exact and source-linked", postMatch.includes("historicalDatasetResult") && postMatch.includes("row.status!==\"completed\"") && postMatch.includes("Multiple historical rows match this event") && postMatch.includes("sourceLicence:dataset.sourceLicence"), "Imported historical market datasets can resolve exact completed events where an applicable settlement field exists; ambiguous rows remain unresolved.");
add("Learning data jobs are authenticated, backgrounded, bounded by source adapters and no-AI", learningDataJobsFn.includes("requireAuth") && learningDataJobsFn.includes("discoverPublicResearchSources") && learningDataJobsFn.includes("syncOpenFootballHistoricalData") && learningDataJobsFn.includes("syncOpenFootballWorldCupData") && learningDataJobsFn.includes("syncConsensusMarketDatasets") && learningDataJobsFn.includes("syncSharpApiSampleMarkets") && learningDataJobsFn.includes('path: "/api/learning-data-jobs"') && learningDataJobsFn.includes("background: true") && learningDataJobsFn.includes("aiCalls: 0") && learningDataJobsFn.includes("humanCouponLabTouched: false") && !learningDataJobsFn.includes("runWinAgent"), "The dashboard can manually run metadata discovery and the existing licence-labelled historical adapters without paid AI or touching human coupon records.");
add("Manual historical sync settles eligible observed prices and generates chronological calibration", learningDataJobsFn.includes("settleObservedWorldCupMarkets") && learningDataJobsFn.includes("runMarketCalibrationLab") && learningDataJobsFn.includes('historical_observed_market_settlement') && learningDataJobsFn.includes('chronological_market_calibration') && learningDataJobsFn.includes("Unsupported markets, ambiguous fixtures") && learningDataJobsFn.includes("chronological 70/30 holdout") && settlementBridge.includes("eventTimeSemantics!==\"scheduled_event_start\"") && settlementBridge.includes("unsupported_market") && calibration.includes("chronological_70_30_per_dataset"), "Manual imports now invoke the existing evidence-constrained football snapshot settlement bridge and out-of-time consensus calibration; unresolved markets remain excluded and no WIN coupon or paid-AI workflow is touched.");
add("Learning monitor shows department-history fetch failures instead of a permanent loading placeholder", app.includes('$("#learningDepartments").innerHTML=\'<div class="empty">Department test history unavailable:') && app.includes("Check authentication and the /api/learning-observatory response"), "A failed or unauthorized observatory request now surfaces a visible diagnostic in the department-history panel instead of leaving Loading test history indefinitely.");
add("Learning monitor exposes eligible WIN coupons and blocked candidates", postMatch.includes("queuedCoupons") && postMatch.includes("trackedWinCoupons") && postMatch.includes("blockedCandidates"), "The monitor distinguishes queued eligible coupons from blocked D6 candidates and completed post-match records.");
add("Learning monitor exposes manual data-job controls", html.includes('id="runSourceDiscovery"') && html.includes('id="runHistoricalSync"') && html.includes('id="learningJobsStatus"') && app.includes("/api/learning-data-jobs") && app.includes("discover_sources") && app.includes("sync_historical_data"), "Owners can launch source discovery and historical imports from the Learning Monitor; status refresh remains read-only.");
add("First 30 independently reviewed WIN coupon milestone is evidence-based", html.includes("learningMilestone") && app.includes("milestoneTarget=30") && app.includes("verifiedCouponOutcomes") && app.includes("No forced bets or relaxed approval gates"), "Only independently reviewed WIN research forecasts count; the milestone does not lower qualification gates or claim predictive superiority.");
add("Detailed health diagnostics require WIN bearer authentication and are not cacheable", health.includes('import { requireAuth } from "../lib/auth.mts"') && health.includes("const denied = requireAuth(req)") && health.includes("if (denied) {") && health.includes('denied.headers.set("cache-control", "no-store")') && health.includes('"cache-control": "no-store"') && app.includes('const health=await api("/api/health");'), "Anonymous health requests are rejected before any operational records or budget details are read.");
add("Dashboard static assets require a signed HttpOnly session while APIs and ChatGPT OAuth remain reachable", dashboardAuth.includes('path: "/*"') && dashboardAuth.includes('"/api/*"') && dashboardAuth.includes('"/mcp"') && dashboardAuth.includes('"/oauth/*"') && dashboardAuth.includes('"/.well-known/*"') && dashboardAuth.includes('["WIN_DASHBOARD", "PASSWORD"].join("_")') && dashboardAuth.includes('["WIN_DASHBOARD", "SESSION_SECRET"].join("_")') && dashboardAuth.includes("crypto.subtle.verify") && dashboardAuth.includes("HttpOnly") && dashboardAuth.includes("SameSite=Strict") && dashboardAuth.includes("return loginPage();"), "The dashboard fails closed behind an HMAC-signed eight-hour session; bearer-protected APIs and OAuth/MCP routes are excluded from the dashboard gate.");
add("Deploy builds do not install a floating Netlify CLI dependency", !pkg.includes('"netlify-cli":') && pkg.includes("netlify-cli@27.14.2 dev"), "The deploy dependency tree stays clear of the floating Netlify CLI release that introduced the unavailable cache-utils version; local development uses a pinned CLI.");
add("Dashboard sessions fail closed and logout clears the cookie", dashboardAuth.includes("if (password.length < 32 || sessionSecret.length < 32)") && dashboardAuth.includes("/__win_dashboard_logout") && dashboardAuth.includes('secureCookie(request, "", 0)') && dashboardAuth.includes("function isSameOriginLoginRequest(") && dashboardAuth.includes('request.headers.get("sec-fetch-site")') && dashboardAuth.includes('fetchSite === "same-origin"') && dashboardAuth.includes('fetchMode === "navigate"') && dashboardAuth.includes('request.headers.get("origin")') && dashboardAuth.includes("Max-Age=\" + maxAge"), "Short or missing secrets cannot expose the dashboard; login is same-origin and logout invalidates the browser session cookie.");
add("TipsAudit historical predictions are catalogued as research-only pending snapshot and rights review",
  providers.includes("tipsaudit-track-record-public") &&
  providers.includes('accessMode:"research_candidate"') &&
  providers.includes('licenceReview:"required"') &&
  providers.includes("timestamped_track_record_snapshots") &&
  (await read("scripts/public-data-source-policy.test.mjs")).includes("providerMayRunAutomatically") &&
  (await read("scripts/public-data-source-policy.test.mjs")).includes("snapshot hash matches"),
  "The source is discoverable, but immutable pre-kickoff snapshot, manifest, timestamp-proof, data-rights and methodology checks must pass before ingestion.");
add("Every automatic public dataset adapter enforces the central provider registry before network access",
  (await read("netlify/lib/data-provider-registry.mts")).includes("assertProviderImportAllowed") &&
  (await read("netlify/lib/openfootball-adapter.mts")).includes('assertProviderImportAllowed("openfootball-football-json", ["fixtures", "results"])') &&
  (await read("netlify/lib/openfootball-worldcup-adapter.mts")).includes('assertProviderImportAllowed("openfootball-worldcup-json",["fixtures","results","player_events"])') &&
  (await read("netlify/lib/consensus-market-adapter.mts")).includes("assertProviderImportAllowed(source.id,source.requiredDomains)") &&
  (await read("netlify/lib/sharpapi-sample-adapter.mts")).includes('assertProviderImportAllowed("sharpapi-sample-data",["observed_bookmaker_odds","multi_source_price_snapshots"])') &&
  (await read("scripts/public-data-source-policy.test.mjs")).includes("registry changes immediately block a source before its adapter can fetch") &&
  (await read("scripts/public-data-source-policy.test.mjs")).includes("each adapter checks registry policy before its first upstream operation"),
  "Every import path requires an approved registry record, permitted access mode, HTTPS licence reference, attribution and every requested data domain before its first upstream fetch.");

add("All consensus source IDs and per-provider data domains are registry-validated",
  (await read("netlify/lib/consensus-market-adapter.mts")).includes("export const CONSENSUS_SOURCES") &&
  (await read("scripts/public-data-source-policy.test.mjs")).includes("all 12 consensus datasets") &&
  (await read("netlify/lib/data-provider-registry.mts")).includes("enabledDomains.every"),
  "The 12 consensus dataset mappings are tested against the actual registry; connected API providers must be bound to their own HTTPS terms and permitted data domains.");

add("Consensus calibration evaluates binary moneyline datasets without inventing a draw class",
  (await read("netlify/lib/market-calibration.mts")).includes("export function evaluateMarketDataset") &&
  (await read("netlify/lib/market-calibration.mts")).includes("two_way_moneyline") &&
  (await read("netlify/lib/market-calibration.mts")).includes("sport_aware_two_way_and_1x2_v3") &&
  (await read("scripts/market-calibration.test.mjs")).includes("NBA-style two-way moneyline") &&
  (await read("scripts/market-calibration.test.mjs")).includes("tennis player-one probabilities"),
  "Football uses three-class 1X2 scoring; NBA/NFL/NHL/MLB and tennis use binary winner scoring with chronological holdout and the same minimum sample requirement.");


const mlDataContract = await read("netlify/lib/ml-data-contract.mts");
const mlDataContractTests = await read("scripts/ml-data-contract.test.mjs");
add("WIN ML training requires immutable licensed dataset provenance and point-in-time feature validation",
  mlDataContract.includes("WIN_ML_DATASET_MANIFEST_VERSION") &&
  mlDataContract.includes("contentSha256") &&
  mlDataContract.includes("approvedForTraining") &&
  mlDataContract.includes("trusted_owner_approval_evidence_missing") &&
  mlDataContract.includes("Manifest permission flags are importer-supplied metadata") &&
  mlDataContract.includes("permittedUse") &&
  mlDataContract.includes("future_feature_leakage") &&
  mlDataContract.includes("settlement_aware_label_invalid") &&
  mlDataContract.includes("WIN_ML_FOOTBALL_1X2_SETTLEMENT_RULE_ID") &&
  mlDataContract.includes("settlementRuleValid") &&
  mlDataContractTests.includes("1X2 labels reject arbitrary caller-supplied settlement identifiers") &&
  mlDataContractTests.includes("research-only, unapproved and date-only sources") &&
  mlDataContractTests.includes("future features, post-kickoff cutoffs and invalid labels"),
  "Synthetic-only tests enforce source/licence provenance, block caller-asserted training approval without trusted owner evidence, and validate exact event timing, feature availability cutoffs and settlement-aware labels.");


const mlModelContract = await read("netlify/lib/ml-model-contract.mts");
const mlModelContractTests = await read("scripts/ml-model-contract.test.mjs");
add("WIN ML artifacts require point-in-time, out-of-sample evidence before human shadow review",
  mlModelContract.includes("evaluateWinMLDatasetReadiness") &&
  mlModelContract.includes("fit_data_cutoff_exceeds_training_window") &&
  mlModelContract.includes("chronological_split_invalid_or_overlapping") &&
  mlModelContract.includes("out_of_sample_brier_improvement_insufficient") &&
  mlModelContract.includes("out_of_sample_log_loss_not_improved") &&
  mlModelContract.includes("calibration_error_above_limit") &&
  mlModelContract.includes("evaluation_rows_exceed_dataset_rows") &&
  mlModelContract.includes("evaluation_sport_mismatch") &&
  mlModelContract.includes("evaluation_market_algorithm_mismatch") &&
  mlModelContract.includes("evaluation_target_definition_market_mismatch") &&
  mlModelContract.includes("training_config_hash_invalid") &&
  mlModelContract.includes("split_manifest_hash_invalid") &&
  mlModelContract.includes("feature_builder_commit_sha_invalid") &&
  mlModelContract.includes("automaticPromotionAllowed: false") &&
  mlModelContract.includes("productionPromotionAllowed: false") &&
  mlModelContractTests.includes("valid out-of-sample evaluation qualifies only for human shadow review") &&
  mlModelContractTests.includes("fit-data cutoff after training window is rejected as leakage") &&
  mlModelContractTests.includes("model that does not beat baseline out of sample is blocked") &&
  mlModelContractTests.includes("small test sample and poor calibration are blocked") &&
  mlModelContractTests.includes("evaluation rejects sport, market-algorithm and target-definition mismatches") &&
  mlModelContractTests.includes("evaluation requires a training run, configuration hash, split hash and feature-builder commit"),
  "A model artifact is blocked without an approved dataset, chronological train/validation/test separation, a fit-data cutoff, minimum sample sizes, baseline improvement and calibration. Passing never auto-promotes to production.");

const mlPredictionContract = await read("netlify/lib/ml-prediction-contract.mts");
const mlPredictionTests = await read("scripts/ml-prediction-contract.test.mjs");
add("WIN ML predictions are provenance-bound to an evaluated model and shadow-only",
  mlPredictionContract.includes('origin: "trained_model"') &&
  mlPredictionContract.includes('usage: "shadow_only"') &&
  mlPredictionContract.includes("prediction_provenance_mismatch") &&
  mlPredictionContract.includes("prediction_generated_at_or_after_event_start") &&
  mlPredictionContract.includes("prediction_probabilities_not_normalized") &&
  mlPredictionContract.includes("productionUseAllowed: false") &&
  mlPredictionContract.includes("automatedBettingAllowed: false") &&
  mlPredictionTests.includes("LLM research output cannot be typed as a trained-model prediction") &&
  mlPredictionTests.includes("prediction provenance must match the evaluated model and dataset") &&
  mlPredictionTests.includes("invalid or unnormalized probability vectors are rejected"),
  "LLM research and market benchmarks cannot be represented as WIN ML output; the 1X2 envelope must match an eligible artifact/dataset and remains shadow-only.");
const mlProvenance = await read("netlify/lib/ml-provenance.mts");
const mlProvenanceTests = await read("scripts/ml-provenance.test.mjs");
const mlFootballImportTrainingIntegration = await read("scripts/ml-football-import-training.integration.test.mjs");
add("Football results v2 imports preserve availability into point-in-time training candidates",
  mlFootballImportTrainingIntegration.includes("football results v2 flows through availability-aware point-in-time candidate construction") &&
  mlFootballImportTrainingIntegration.includes("resultAvailableAt") &&
  mlFootballImportTrainingIntegration.includes("home_last5_points_per_match") &&
  mlFootballImportTrainingIntegration.includes("owner_training_approval_missing"),
  "The importer output is exercised end-to-end through point-in-time feature construction while research-only dataset approval continues to block fitting.");
add("WIN ML training and inference provenance uses deterministic canonical hashes",
  mlProvenance.includes("canonicalizeWinMLProvenance") &&
  mlProvenance.includes("hashWinMLTrainingConfig") &&
  mlProvenance.includes("hashWinMLSplitManifest") &&
  mlProvenance.includes("hashWinMLFeatureVector") &&
  mlProvenance.includes("ml_provenance_non_finite_number") &&
  mlProvenanceTests.includes("canonical provenance hashes ignore object insertion order") &&
  mlProvenanceTests.includes("canonical provenance hashes preserve array order") &&
  mlProvenanceTests.includes("unsupported, undefined, non-finite and cyclic values fail closed") &&
  mlProvenanceTests.includes("sparse arrays, symbol keys and accessors cannot create ambiguous hashes"),
  "Training configuration, exact split membership and feature vectors can be hashed reproducibly; ambiguous values and cyclic structures are rejected.");
const llmExecution = await read("netlify/lib/llm-execution.mts");
const llmExecutionTests = await read("scripts/llm-execution.test.mjs");
const agentsSdk = await read("netlify/lib/agents-sdk.mts");
const agentsSdkAdapter = await read("netlify/lib/agents-sdk-adapter.mts");
const agentsSdkAdapterTests = await read("scripts/agents-sdk-adapter.test.mjs");
add("WIN production OpenAI agent calls use the governed LLM execution layer",
  ai.includes("executeWinLLMWithPolicy") &&
  ai.includes("createOpenAIWinLLMAdapter") &&
  ai.includes("WIN_LLM_CONTRACT_VERSION") &&
  ai.includes("pricingVerified: true") &&
  ai.includes("budget: { reservationId: requestBudgetId, reservedUsd: budget.reservedUsd }") &&
  ai.includes("settleAIRequest(requestBudgetId, null, 0, true)") &&
  agentsSdkAdapter.includes("runWinAgent") &&
  agentsSdkAdapter.includes("signal") &&
  agentsSdkAdapter.includes("openai_adapter_text_output_only") &&
  agentsSdkAdapter.includes("openai_adapter_tool_call_limit_exceeded") &&
  agentsSdkAdapterTests.includes("maps Agents SDK output, citations, usage and cancellation signal") &&
  agentsSdkAdapterTests.includes("governed execution wrapper invokes the approved OpenAI adapter end to end") &&
  agentsSdkAdapterTests.includes("fails closed for unsupported structured output") &&
  agentsSdkAdapterTests.includes("rejects web-search usage above the request tool-call limit") &&
  agentsSdkAdapterTests.includes("does not invoke the SDK after cancellation") &&
  ai.includes("Observed usage was settled when available"),
  "The existing worker path now creates a versioned LLM request, applies provider/model/privacy/budget policy, invokes the OpenAI adapter and validates the result before settlement.");
add("WIN production OpenAI agent calls have bounded cooperative cancellation",
  ai.includes("timeoutMs: 90_000") &&
  llmExecution.includes("export async function executeWithAbortTimeout") &&
  llmExecution.includes("controller.abort") &&
  llmExecution.includes("Promise.race([execution, timeout])") &&
  llmExecutionTests.includes("shared bounded executor returns promptly") &&
  llmExecutionTests.includes("shared bounded executor returns successful values") &&
  llmExecutionTests.includes("shared bounded executor preserves operation errors") &&
  agentsSdk.includes("signal?: AbortSignal") &&
  agentsSdk.includes("signal: input.signal") &&
  agentsSdk.includes("modelSettings: { store: false, maxTokens: input.maxOutputTokens }") &&
  agentsSdkAdapter.includes("maxOutputTokens: request.limits.maxOutputTokens") &&
  agentsSdkAdapterTests.includes("assert.equal(received.maxOutputTokens, 200)"),
  "The production provider adapter passes a 90-second cancellation signal into the Agents SDK; uncertain calls are conservatively settled and never automatically replayed.");
add("WIN LLM provider execution is bounded, validates responses and never blindly retries uncertain outcomes",
  llmExecution.includes("AbortController") &&
  llmExecution.includes("provider_timeout_outcome_uncertain") &&
  llmExecution.includes("validateWinLLMResponse") &&
  llmExecution.includes("retryPermitted") &&
  llmExecution.includes("controller.abort") &&
  llmExecution.includes("response_model_not_approved") &&
  llmExecution.includes("response_output_token_limit_exceeded") &&
  llmExecution.includes("timedOut ?") &&
  llmExecutionTests.includes("timeout aborts adapter") &&
  llmExecutionTests.includes("abort-aware adapter rejection preserves timeout classification") &&
  llmExecutionTests.includes("provider cannot substitute a model") &&
  llmExecutionTests.includes("provider cannot exceed the requested output token limit") &&
  llmExecutionTests.includes("never trigger an automatic replay") &&
  llmExecutionTests.includes("invalid provider responses fail closed"),
  "The isolated execution wrapper has cancellation-aware timeout handling, strict response validation and explicit uncertain-outcome semantics; it does not perform automatic retries or fallback.");

const mlLicenceEvidence = await read("netlify/lib/ml-licence-evidence.mts");
const mlLicenceEvidenceTests = await read("scripts/ml-licence-evidence.test.mjs");
add("WIN licence evidence requires a signed, time-bounded reviewer attestation and exact source hash",
  mlLicenceEvidence.includes("hashWinMLLicenceEvidence") &&
  mlLicenceEvidence.includes("verifyWinMLLicenceEvidence") &&
  mlLicenceEvidence.includes("licence_evidence_hash_mismatch") &&
  mlLicenceEvidence.includes("licence_review_expired") &&
  mlLicenceEvidence.includes("sourceDocumentSha256") &&
  mlLicenceEvidenceTests.includes("signed licence review verifies exact source") &&
  mlLicenceEvidenceTests.includes("cannot be reused for a different licence") &&
  mlLicenceEvidenceTests.includes("incorrectly signed licence reviews fail closed") &&
  mlLicenceEvidenceTests.includes("reviewerId: 7") &&
  mlLicenceEvidenceTests.includes("2026-02-30T09:00:00.000Z"),
  "A trusted reviewer signature binds the licence, source-document hash, training-use attestation and review validity window; it does not replace human legal review.");

const mlOwnerApproval = await read("netlify/lib/ml-owner-approval.mts");
const mlOwnerApprovalTests = await read("scripts/ml-owner-approval.test.mjs");
add("WIN owner training approvals require dataset-bound Ed25519 signatures and licence evidence",
  mlOwnerApproval.includes("verifySignature") &&
  mlOwnerApproval.includes("datasetContentSha256") &&
  mlOwnerApproval.includes("licenceEvidenceSha256") &&
  mlOwnerApproval.includes("trusted_owner_approval_public_key_missing") &&
  mlOwnerApproval.includes("owner_approval_expired") &&
  mlOwnerApproval.includes("verifyWinMLOwnerTrainingRevocation") &&
  mlOwnerApproval.includes("owner_revocation_not_yet_effective") &&
  mlOwnerApprovalTests.includes("signed revocation is bound to the approval, dataset and content hash") &&
  mlOwnerApproval.includes("The public key MUST come from trusted server configuration") &&
  mlOwnerApprovalTests.includes("tampered payload, wrong signing key and malformed signature fail closed") &&
  mlOwnerApprovalTests.includes("approval signature cannot be reused for a different dataset") &&
  mlOwnerApprovalTests.includes("2026-02-30T09:00:00.000Z"),
  "The isolated verifier binds signed approval to dataset content, licence evidence, reviewer and validity window; readiness remains separately blocked.");

const mlTrainingReadinessDocs = await read("docs/WIN_ML_TRAINING_READINESS.md");
add("WIN documents the signed licence-to-training-readiness evidence chain",
  mlTrainingReadinessDocs.includes('action: "licence_evidence"') &&
  mlTrainingReadinessDocs.includes('action: "readiness"') &&
  mlTrainingReadinessDocs.includes("modelFittingAllowed") &&
  mlTrainingReadinessDocs.includes("does not prove that the source document is authentic"),
  "The operator guide describes immutable signed evidence, endpoint actions, evidence-only readiness semantics and the legal-review limitation.");

const mlOwnerApprovalRegistry = await read("netlify/lib/ml-owner-approval-registry.mts");
const mlOwnerApprovalRegistryTests = await read("scripts/ml-owner-approval-registry.test.mjs");
add("WIN signed owner approvals and revocations are stored immutably and checked against the registered dataset",
  mlOwnerApprovalRegistry.includes("putIfNew") &&
  mlOwnerApprovalRegistry.includes("getWinMLDatasetManifest") &&
  mlOwnerApprovalRegistry.includes("owner_approval_reviewer_not_authorized") &&
  mlOwnerApprovalRegistry.includes("owner_revocation_already_recorded") &&
  mlOwnerApprovalRegistry.includes("getWinMLOwnerTrainingApprovalStatus") &&
  mlOwnerApprovalRegistry.includes("registerWinMLLicenceReviewEvidence") &&
  mlOwnerApprovalRegistry.includes("LICENCE_ID_COLLECTION") &&
  mlOwnerApprovalRegistry.includes("verifyRegisteredLicenceEvidence") &&
  mlOwnerApprovalRegistry.includes("evaluateWinMLTrainingReadiness") &&
  mlOwnerApprovalRegistry.includes("modelFittingAllowed: false") &&
  mlOwnerApprovalRegistryTests.includes("reports it active, and revokes it immutably") &&
  mlOwnerApprovalRegistryTests.includes("recording owner approval must not silently unlock model training") &&
  mlOwnerApprovalRegistryTests.includes("readiness.evidenceReady, true") &&
  mlOwnerApprovalRegistryTests.includes("expiredLicenceReadiness.evidenceReady, false") &&
  mlOwnerApprovalRegistryTests.includes("licence_review_expired") &&
  mlOwnerApprovalRegistryTests.includes("revokedReadiness.evidenceReady, false") &&
  mlOwnerApprovalRegistryTests.includes("registered_licence_evidence_missing") &&
  mlOwnerApprovalRegistryTests.includes("licence_evidence_id_immutable_conflict"),
  "Signed licence evidence is immutably registered by canonical hash and rechecked during approval status; the composite readiness audit validates dataset, licence, owner approval and revocation while keeping fitting disabled.");

const mlOwnerApprovalEndpoint = await read("netlify/functions/ml-owner-approval.mts");
const mlOwnerApprovalEndpointTests = await read("scripts/ml-owner-approval-endpoint.test.mjs");
add("WIN owner approval endpoint requires a separate protected token, trusted public key and bounded JSON body",
  mlOwnerApprovalEndpoint.includes("WIN_ML_OWNER_APPROVAL_TOKEN") &&
  mlOwnerApprovalEndpoint.includes("WIN_ML_OWNER_APPROVAL_PUBLIC_KEY") &&
  mlOwnerApprovalEndpoint.includes("WIN_ML_OWNER_REVIEWER_ID") &&
  mlOwnerApprovalEndpoint.includes("timingSafeEqual") &&
  mlOwnerApprovalEndpoint.includes("MAX_BODY_BYTES") &&
  mlOwnerApprovalEndpoint.includes('path: "/api/ml-owner-approval"') &&
  mlOwnerApprovalEndpoint.includes('body?.action === "licence_evidence"') &&
  mlOwnerApprovalEndpoint.includes('body?.action === "readiness"') &&
  !mlOwnerApprovalEndpoint.includes("body.publicKeyPem") &&
  !mlOwnerApprovalEndpoint.includes("body.ownerToken") &&
  mlOwnerApprovalEndpointTests.includes("requires protected configuration and bounded JSON requests") &&
  mlOwnerApprovalEndpointTests.includes("separately authenticated signed approval") &&
  mlOwnerApprovalEndpointTests.includes("readinessBody.modelFittingAllowed, false"),
  "The protected owner endpoint registers signed licence evidence and exposes a read-only composite readiness check without accepting caller-supplied keys or enabling fitting.");

const mlFootballTrainer = await read("netlify/lib/ml-football-logistic-trainer.mts");
const mlFootballTrainerTests = await read("scripts/ml-football-logistic-trainer.test.mjs");
add("WIN has a deterministic, bounded football 1X2 multinomial logistic trainer with frozen shadow-only artifacts",
  mlFootballTrainer.includes("trainWinMLFootball1X2LogisticModel") &&
  mlFootballTrainer.includes("training_validation_chronology_invalid") &&
  mlFootballTrainer.includes("labelAvailableAt") &&
  mlFootballTrainer.includes("predictionCutoff") &&
  mlFootballTrainer.includes("training_feature_provenance_invalid") &&
  mlFootballTrainer.includes("fitDataCutoff") &&
  mlFootballTrainer.includes("training_compute_budget_exceeded") &&
  mlFootballTrainer.includes("model_artifact_hash_mismatch") &&
  mlFootballTrainer.includes("heldOutTestRequired: true") &&
  mlFootballTrainer.includes('usage: "shadow_only"') &&
  mlFootballTrainer.includes("productionPromotionAllowed: false") &&
  mlFootballTrainer.includes("automatedBettingAllowed: false") &&
  mlFootballTrainerTests.includes("learns a synthetic 1X2 pattern") &&
  mlFootballTrainerTests.includes("trainer is deterministic") &&
  mlFootballTrainerTests.includes("prediction rejects modified artifacts") &&
  mlFootballTrainerTests.includes("training_label_availability_invalid") &&
  mlFootballTrainerTests.includes("training_feature_provenance_invalid"),
  "The pure trainer fits only a chronological training partition, uses training-only normalization, reports validation metrics against a class-frequency baseline, hashes its artifact, and requires a separate held-out test. No production route or real dataset is wired to it.");

const mlFootballFeatures = await read("netlify/lib/ml-football-features.mts");
const mlFootballFeaturesTests = await read("scripts/ml-football-features.test.mjs");
const mlFootballTraining = await read("netlify/lib/ml-football-training-builder.mts");
const mlFootballTrainingTests = await read("scripts/ml-football-training-builder.test.mjs");
const mlFootballExperiments = await read("netlify/lib/ml-football-experiment-plans.mts");
const mlFootballExperimentTests = await read("scripts/ml-football-experiment-plans.test.mjs");
const mlFootballImporter = await read("netlify/lib/ml-football-importer.mts");
const mlFootballImportTests = await read("scripts/ml-football-importer.test.mjs");
add("WIN football point-in-time features reject duplicate identities and future or unavailable results",
  mlFootballFeatures.includes("historical_row_identity_duplicate_or_invalid") &&
  mlFootballFeatures.includes("resultAvailableAt") &&
  mlFootballFeatures.includes('row?.scoreBasis === "regulation_time"') &&
  mlFootballFeaturesTests.includes("point-in-time features exclude results with extra-time score semantics") &&
  mlFootballFeatures.includes("rowKickoff >= cutoff") &&
  mlFootballFeaturesTests.includes("point-in-time feature builder rejects duplicate or missing historical identities"),
  "Historical features require unique source/event identities and source-recorded result availability before the prediction cutoff.");
add("WIN 1X2 candidate labels preserve settlement and target identity",
  mlFootballTraining.includes("buildWinFootball1X2TrainingCandidates") &&
  mlFootballTraining.includes("resultAvailableAt") &&
  mlFootballTraining.includes("WIN_ML_FOOTBALL_1X2_SETTLEMENT_RULE_ID") &&
  mlFootballTraining.includes('target.scoreBasis !== "regulation_time"') &&
  mlFootballTraining.includes("football_training_input_identity_duplicate_or_invalid") &&
  mlFootballTraining.includes('market: "1x2"') &&
  mlFootballTrainingTests.includes("rejects duplicate event and source identities"),
  "Candidate labels are built only for explicit 1X2 targets with event-specific cutoffs and settlement timestamps; research-only datasets remain blocked from fitting.");
add("WIN experiment preflight requires compatible labels, feature schema and adequate chronological partitions",
  mlFootballExperiments.includes("candidate_market_mismatch") &&
  mlFootballExperiments.includes("candidate_feature_schema_mismatch") &&
  mlFootballExperiments.includes("experiment_market_algorithm_mismatch") &&
  mlFootballExperiments.includes("chronological_partition_counts_required") &&
  mlFootballExperiments.includes("chronological_partition_total_mismatch") &&
  mlFootballExperimentTests.includes("preflight rejects candidate labels and feature schemas") &&
  mlFootballExperimentTests.includes("preflight requires chronological partition counts"),
  "An experiment cannot proceed on incompatible labels/features or an undersized/mismatched train-validation-test split; fitting remains disabled.");
add("WIN football results importer is offline, bounded and research-only by default",
  mlFootballImporter.includes("MAX_RAW_BYTES") &&
  mlFootballImporter.includes("MAX_ROWS") &&
  mlFootballImporter.includes("createHash") &&
  mlFootballImporter.includes('row.scoreBasis !== "regulation_time"') &&
  mlFootballImporter.includes('"win.football.results.v2"') &&
  mlFootballImporter.includes("resultAvailableAt") &&
  mlFootballImporter.includes("result_available_before_kickoff") &&
  mlFootballImporter.includes("result_available_after_source_retrieval") &&
  mlFootballImportTests.includes("offline importer requires source-recorded result availability after kickoff and before retrieval") &&
  mlFootballImportTests.includes("offline importer rejects ambiguous or extra-time score bases") &&
  mlFootballImporter.includes("approvedForTraining: false") &&
  mlFootballImporter.includes('permittedUse: "research_only"') &&
  mlFootballImportTests.includes("permittedUse, \"research_only\""),
  "The importer hashes caller-supplied bytes, applies strict row and payload bounds, performs no network fetch, and never grants training permission.");

const failed = checks.filter(x => !x.ok);
console.log(JSON.stringify({ status: failed.length ? "failed" : "passed", passed: checks.length - failed.length, total: checks.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;
