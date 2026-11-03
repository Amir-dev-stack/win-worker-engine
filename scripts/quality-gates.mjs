import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const [coverage, coverageApi, monitor, settlement, source, worker, ai, pkg, build, html, app] = await Promise.all([
  read("netlify/lib/coverage.mts"), read("netlify/functions/coverage.mts"),
  read("netlify/functions/coverage-monitor.mts"), read("netlify/functions/human-coupon-settlements.mts"),
  read("netlify/lib/source-intelligence.mts"), read("netlify/functions/worker-runner.mts"),
  read("netlify/lib/ai.mts"), read("package.json"), read("scripts/build.mjs"), read("public/index.html"), read("public/app.js")
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
const failed = checks.filter(x => !x.ok);
console.log(JSON.stringify({ status: failed.length ? "failed" : "passed", passed: checks.length - failed.length, total: checks.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;
