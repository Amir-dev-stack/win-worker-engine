import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const [coverage, coverageApi, monitor, settlement, source, worker, ai, pkg, build, html, app, providers, adapter, modelLab, syncFn, statusFn, consensusAdapter, consensusSync, sharpAdapter, sharpSync, calibration, workerOrg, scheduledAgentRunner] = await Promise.all([
  read("netlify/lib/coverage.mts"), read("netlify/functions/coverage.mts"),
  read("netlify/functions/coverage-monitor.mts"), read("netlify/functions/human-coupon-settlements.mts"),
  read("netlify/lib/source-intelligence.mts"), read("netlify/functions/worker-runner.mts"),
  read("netlify/lib/ai.mts"), read("package.json"), read("scripts/build.mjs"), read("public/index.html"), read("public/app.js"),
  read("netlify/lib/data-provider-registry.mts"), read("netlify/lib/openfootball-adapter.mts"), read("netlify/lib/model-lab.mts"),
  read("netlify/functions/openfootball-sync.mts"), read("netlify/functions/research-status.mts"),
  read("netlify/lib/consensus-market-adapter.mts"), read("netlify/functions/consensus-market-sync.mts"),
  read("netlify/lib/sharpapi-sample-adapter.mts"), read("netlify/functions/sharpapi-sample-sync.mts"), read("netlify/lib/market-calibration.mts"), read("netlify/lib/worker-org.mts"), read("netlify/functions/scheduled-scout-runner.mts")
]);
add("Coverage is calculated from persisted evidence", coverage.includes("library/research-evidence") && coverage.includes("not_observed") && coverage.includes("stale_or_undated"), "No missing coverage is fabricated.");
add("Every registered sport is reported", coverage.includes("SPORT_REGISTRY.map") && coverage.includes("requiredDomains"), "Sport coverage is based on the current registry.");
add("Coverage API is authenticated", coverageApi.includes("requireAuth") && coverageApi.includes("/api/coverage"), "GET /api/coverage requires authentication.");
add("Coverage snapshots run without AI", monitor.includes('schedule: "0 */6 * * *"') && !monitor.includes("runWinAgent"), "Six-hour snapshots use stored data only.");
add("Human settlement claims cannot auto-settle", settlement.includes("pending_independent_review") && settlement.includes("outcomeApplied: false") && settlement.includes("coupon.outcome"), "Evidence submissions stay pending and do not change coupon outcomes.");
add("Original tipster post cannot verify itself", settlement.includes("coupon.source") && settlement.includes("evidenceUrl"), "Original post is rejected as its own settlement evidence.");
add("Public human imports require explicit content class", source.includes('"original human coupon", "single human pick"') && source.includes("contentClass"), "Only original coupons and single picks enter public archive.");
add("D5 archive rejects unclassified content", worker.includes("missing_or_ineligible_content_class") && worker.includes('"original human coupon", "single human pick"'), "Promotions, demos, consensus and unclassified content are excluded.");
add("AI budget remains explicit and fail-closed", ai.includes("WIN_AI_BUDGET_APPROVED") && ai.includes("provider-side monthly spending limit"), "No new automatic AI spending is enabled.");
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
add("Market calibration is chronological and isolated", calibration.includes("chronological_70_30_per_dataset") && calibration.includes("humanCouponLabTouched:false") && calibration.includes("testMetrics"), "Market consensus is evaluated out of time without using human coupon records.");
add("Model Lab excludes bookmaker ROI claims for consensus prices", calibration.includes("does not establish betting ROI") && calibration.includes("Consensus fair probabilities are not bookmaker prices"), "No false execution-price or profitability claim.");
add("Dynamic entity agents are independently queued", workerOrg.includes("queued_independent_api_request") && workerOrg.includes("deduplicated by stable agent ID") && worker.includes("enqueuePersistentAgentTasks") && worker.includes("library/agent-task-queue"), "Sport, country, competition, club, player, manager and event identities become separate queued tasks.");
add("Scheduled learning executes one queued entity agent per cycle", scheduledAgentRunner.includes("pendingAgentTasks") && scheduledAgentRunner.includes("WIN_ENTITY_AGENT_JSON") && scheduledAgentRunner.includes("library/persistent-agent-profiles"), "Entity agents run as separate budget-gated API calls and keep unvalidated profile histories.");
add("Research agents receive the isolated Model Lab pack", worker.includes("getModelLabResearchPack") && scheduledAgentRunner.includes("getModelLabResearchPack") && ai.includes("modelLabResearchPack"), "Departments and scheduled agents can read Model Lab evidence without importing human coupons.");
add("Research status exposes agent execution", statusFn.includes("persistentAgents") && statusFn.includes("library/agent-task-queue"), "Queue, profile and execution status is visible through the authenticated status API.");
const failed = checks.filter(x => !x.ok);
console.log(JSON.stringify({ status: failed.length ? "failed" : "passed", passed: checks.length - failed.length, total: checks.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;
