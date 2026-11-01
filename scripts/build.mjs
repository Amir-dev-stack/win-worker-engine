import { access, readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "public/app.js",
  "netlify/functions/health.mts",
  "netlify/functions/runs.mts",
  "netlify/functions/library.mts",
  "netlify/functions/mcp.mts",
  "netlify/functions/oauth-authorize.mts",
  "netlify/functions/oauth-metadata.mts",
  "netlify/functions/oauth-register.mts",
  "netlify/functions/oauth-token.mts",
  "netlify/functions/worker-runner.mts",
  "netlify/functions/hourly-monitor.mts",
  "netlify/functions/scheduled-scout-runner.mts",
  "netlify/functions/ai-budget.mts",
  "netlify/lib/ai-budget.mts",
  "netlify/functions/simulations.mts",
  "netlify/functions/simulation-runner.mts",
  "netlify/functions/sources.mts",
  "netlify/lib/source-intelligence.mts",
  "netlify/lib/simulation.mts",
  "netlify/lib/ai.mts",
  "netlify/lib/worker-org.mts",
  "netlify/lib/library.mts",
  "netlify/lib/oauth-store.mts"
];

for (const file of required) await access(file);

const [html, app, ai, org, mcp, authMeta, authorize, runner, library, libraryApi, sourceLibrary, sourceApi] = await Promise.all([
  readFile("public/index.html", "utf8"),
  readFile("public/app.js", "utf8"),
  readFile("netlify/lib/ai.mts", "utf8"),
  readFile("netlify/lib/worker-org.mts", "utf8"),
  readFile("netlify/functions/mcp.mts", "utf8"),
  readFile("netlify/functions/oauth-metadata.mts", "utf8"),
  readFile("netlify/functions/oauth-authorize.mts", "utf8"),
  readFile("netlify/functions/worker-runner.mts", "utf8"),
  readFile("netlify/lib/library.mts", "utf8"),
  readFile("netlify/functions/library.mts", "utf8"),
  readFile("netlify/lib/source-intelligence.mts", "utf8"),
  readFile("netlify/functions/sources.mts", "utf8")
]);

const simulation = await readFile("netlify/lib/simulation.mts", "utf8");
const [aiBudget, hourlyMonitor, scheduledRunner, budgetApi, health] = await Promise.all([
  readFile("netlify/lib/ai-budget.mts", "utf8"),
  readFile("netlify/functions/hourly-monitor.mts", "utf8"),
  readFile("netlify/functions/scheduled-scout-runner.mts", "utf8"),
  readFile("netlify/functions/ai-budget.mts", "utf8"),
  readFile("netlify/functions/health.mts", "utf8")
]);

const checks = [
  [html.includes("WIN Worker Engine"), "Dashboard title is missing."],
  [aiBudget.includes("OPERATING_LIMIT_USD = 4.95") && aiBudget.includes("reserveAIRequest") && aiBudget.includes("onlyIfNew"), "Fail-closed monthly AI budget controller is missing."],
  [ai.includes('WIN_AI_BUDGET_APPROVED') && ai.includes('provider-side monthly spending limit'), "AI calls are not fail-closed pending provider budget approval."],
  [hourlyMonitor.includes('WIN_AI_BUDGET_APPROVED') && hourlyMonitor.includes('blocked_budget_approval_required'), "Scheduled AI is not disabled pending budget approval."],
  [hourlyMonitor.includes('0 */4 * * *') && hourlyMonitor.includes('strategy_hypothesis') && hourlyMonitor.includes('validation_readiness'), "Four-hour intensive-learning cycle rotation is missing."],
  [scheduledRunner.includes('runScheduledLearning') && scheduledRunner.includes('library/learning-cycles'), "Scheduled learning cycle archival is missing."],
  [library.includes('learningCycles') && library.includes('library/learning-cycles'), "Scheduled learning research is not included in mandatory library reviews."],
  [health.includes('aiExecutionApproved') && health.includes('configured_but_disabled_pending_budget_approval'), "Health endpoint does not disclose the AI approval gate."],
  [hourlyMonitor.includes("schedule: \"0 * * * *\"") && hourlyMonitor.includes("12 * 60 * 60 * 1000"), "Balanced hourly monitor / 12-hour scout schedule is missing."],
  [scheduledRunner.includes("runScheduledScout") && scheduledRunner.includes("authorized(req)"), "Authenticated background scheduled scout runner is missing."],
  [budgetApi.includes("/api/ai-budget") && budgetApi.includes("getAIbudgetStatus"), "Authenticated AI budget status endpoint is missing."],
  [health.includes("scheduled_hourly"), "Health endpoint does not disclose scheduled monitoring."],
  [simulation.includes("Math.min(50") && simulation.includes("const minLegs=Math.min(50") && simulation.includes("performanceByLegCount"), "WIN 2–50 leg experiment sweep is missing."],
  [sourceLibrary.includes('import { get, list, put }'), "Tipster source report list dependency is missing."],
  [html.includes("build_latest_coupon") && html.includes("compare_coupons"), "Dashboard coupon task modes are missing."],
  [app.includes("workerNetwork") && app.includes("/api/runs/"), "Dashboard worker-network report view is missing."],
  [ai.includes("WIN_DEPARTMENTS") && ai.includes("runGlobalMaster"), "WIN department orchestration is missing."],
  [org.includes("EVENT_SPECIALISTS") && org.includes("IMWFD_TIERS"), "Dynamic worker hierarchy is missing."],
  [mcp.includes("start_research_run") && mcp.includes("get_run"), "MCP start/read tools are missing."],
  [ai.includes("WIN_LIBRARY_REVIEW_JSON") && ai.includes("WIN_LESSONS_JSON"), "Mandatory library review instructions are missing."],
  [org.includes('tier: "T4"') && org.includes('tier: "T5"') && org.includes('tier: "T6"'), "Club/player/event agent hierarchy is missing."],
  [mcp.includes("search_win_library") && mcp.includes("save_human_coupon") && mcp.includes("record_coupon_outcome"), "MCP WIN library tools are missing."],
  [runner.includes("getMandatoryLearningPack") && runner.includes("archiveRunToLibrary"), "Library pre-review and archival are missing."],
  [authMeta.includes("authorization_response_iss_parameter_supported: true"), "OAuth issuer identification is missing."],
  [authorize.includes('callback.searchParams.set("iss", WIN_ISSUER)'), "OAuth callback does not echo the issuer."],
  [runner.includes("runIndependentWorkers") && runner.includes("runDebate") && runner.includes("runGlobalMaster"), "Full WIN execution pipeline is missing."],
  [org.includes('tier: "T4"') && org.includes('tier: "T5"') && org.includes('tier: "T6"') && org.includes("club_dossier") && org.includes("player_dossier"), "Persistent club/player agent hierarchy is incomplete."],
  [library.includes("getMandatoryLearningPack") && library.includes("archiveRunToLibrary") && library.includes("winning-coupons") && library.includes("losing-coupons"), "Persistent split coupon library is incomplete."],
  [library.includes("ensureLegacyLibraryImport") && library.includes("non_destructive_copy"), "Legacy WIN library import is missing."],
  [libraryApi.includes('path: "/api/library"') && libraryApi.includes("save_coupon") && libraryApi.includes("settle_coupon"), "Authenticated WIN library API is incomplete."],
  [html.includes('id="library"') && app.includes("refreshLibrary") && app.includes("couponForm"), "WIN library dashboard is incomplete."],
  [runner.includes("hasLibraryReviewReceipt") && runner.includes("libraryReviewGate") && runner.includes("missingLibraryReceipts"), "Mandatory library review gate is missing."],
  [mcp.includes("list_tipster_sources") && mcp.includes("import_public_tipster_coupon") && mcp.includes("get_tipster_source_report"), "WIN tipster source MCP tools are missing."],
  [sourceLibrary.includes("automatedCollection: false") && sourceLibrary.includes("authorizedToStore") && sourceLibrary.includes("duplicate"), "WIN tipster source permissions and deduplication are missing."],
  [sourceApi.includes('path: "/api/sources"'), "Authenticated tipster source API is missing."],
  [html.includes('id="sourceIntelligence"') && app.includes("refreshSources"), "Tipster source dashboard is missing."]

];

for (const [passed, error] of checks) if (!passed) throw new Error(error);

console.log("WIN Worker Engine build checks passed (" + required.length + " required files, " + checks.length + " architecture checks).");
