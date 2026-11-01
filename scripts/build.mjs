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
  "netlify/lib/ai.mts",
  "netlify/lib/worker-org.mts",
  "netlify/lib/library.mts",
  "netlify/lib/oauth-store.mts"
];

for (const file of required) await access(file);

const [html, app, ai, org, mcp, authMeta, authorize, runner] = await Promise.all([
  readFile("public/index.html", "utf8"),
  readFile("public/app.js", "utf8"),
  readFile("netlify/lib/ai.mts", "utf8"),
  readFile("netlify/lib/worker-org.mts", "utf8"),
  readFile("netlify/functions/mcp.mts", "utf8"),
  readFile("netlify/functions/oauth-metadata.mts", "utf8"),
  readFile("netlify/functions/oauth-authorize.mts", "utf8"),
  readFile("netlify/functions/worker-runner.mts", "utf8")
]);

const checks = [
  [html.includes("WIN Worker Engine"), "Dashboard title is missing."],
  [html.includes("build_latest_coupon") && html.includes("compare_coupons"), "Dashboard coupon task modes are missing."],
  [app.includes("workerNetwork") && app.includes("get_run"), "Dashboard worker-network report view is missing."],
  [ai.includes("WIN_DEPARTMENTS") && ai.includes("runGlobalMaster"), "WIN department orchestration is missing."],
  [org.includes("EVENT_SPECIALISTS") && org.includes("IMWFD_TIERS"), "Dynamic worker hierarchy is missing."],
  [mcp.includes("start_research_run") && mcp.includes("get_run"), "MCP start/read tools are missing."],
  [app.includes("workerNetwork") && app.includes("get_run"), "Dashboard worker-network report view is missing."],
  [ai.includes("WIN_LIBRARY_REVIEW_JSON") && ai.includes("WIN_LESSONS_JSON"), "Mandatory library review instructions are missing."],
  [org.includes('tier: "T4"') && org.includes('tier: "T5"') && org.includes('tier: "T6"'), "Club/player/event agent hierarchy is missing."],
  [mcp.includes("search_win_library") && mcp.includes("save_human_coupon") && mcp.includes("record_coupon_outcome"), "MCP WIN library tools are missing."],
  [runner.includes("getMandatoryLearningPack") && runner.includes("archiveRunToLibrary"), "Library pre-review and archival are missing."],\n  [authMeta.includes("authorization_response_iss_parameter_supported: true"), "OAuth issuer identification is missing."],
  [authorize.includes('callback.searchParams.set("iss", WIN_ISSUER)'), "OAuth callback does not echo the issuer."],
  [runner.includes("runIndependentWorkers") && runner.includes("runDebate") && runner.includes("runGlobalMaster"), "Full WIN execution pipeline is missing."]
];

for (const [passed, error] of checks) if (!passed) throw new Error(error);

console.log("WIN Worker Engine build checks passed (" + required.length + " required files, " + checks.length + " architecture checks).");
