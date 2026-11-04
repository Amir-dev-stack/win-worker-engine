import { get, list } from "./store.mts";
import { getAIbudgetStatus } from "./ai-budget.mts";
import { getPublicResearchSourceDiscoveryStatus } from "./public-source-discovery.mts";
import { getPostMatchFollowupStatus } from "./post-match-followup.mts";
import { WIN_DEPARTMENTS } from "./worker-org.mts";

const goodOutcome = new Set(["won", "lost"]);
const timeOf=(value:any)=>{const n=Date.parse(typeof value==="string"?value:"");return Number.isFinite(n)?n:0;};
function approved(item:any){
 const review=item?.independentSettlementReview||item?.independentReview;
 return item?.settlementReviewStatus==="approved_by_separate_reviewer_credential"||
  (review?.status==="approved"&&review?.reviewerAuth==="separate_reviewer_credential"&&
   Boolean(review?.reviewerCredentialId)&&timeOf(review?.reviewedAt)>0&&
   Array.isArray(review?.evidence)&&review.evidence.some((e:any)=>{
    try{return new URL(typeof e==="string"?e:e?.url||e?.reference).protocol==="https:";}catch{return false;}
   }));
}
function validatedLesson(item:any){
 const r=item?.independentReview;
 return item?.validationStatus==="validated"&&r?.status==="approved"&&r?.reviewerAuth==="separate_reviewer_credential"&&
  Boolean(item?.submitterCredentialId)&&Boolean(r?.reviewerCredentialId)&&item.submitterCredentialId!==r.reviewerCredentialId&&
  timeOf(r.reviewedAt)>0&&Array.isArray(r.evidence)&&r.evidence.some((e:any)=>{
   try{return new URL(typeof e==="string"?e:e?.url||e?.reference).protocol==="https:";}catch{return false;}
  });
}
export async function getLearningObservatory(){
 const [budget,smoke,reviewerConfig,reviewOps,lessonCases,humanCases,winCases,lessons,coupons,
  postMatch,sourceDiscovery,eventData,consensusData,observedData,playerData,settledMarketData,calibration,cycles,agentTasks]=await Promise.all([
  getAIbudgetStatus(),list<any>("library/department-smoke-tests",100),
  get<any>("library/reviewer-config","active"),list<any>("library/review-operations",200),
  list<any>("library/lesson-review-cases",200),list<any>("library/human-settlement-cases",250),
  list<any>("library/win-post-match-review-cases",200),list<any>("library/lessons",250),
  list<any>("library/coupons",250),getPostMatchFollowupStatus(),
  getPublicResearchSourceDiscoveryStatus(),list<any>("library/model-lab/historical-event-datasets",200),
  list<any>("library/model-lab/market-consensus-datasets",100),list<any>("library/model-lab/observed-market-snapshots",100),
  list<any>("library/model-lab/player-event-datasets",200),list<any>("library/model-lab/settled-observed-markets",100),
  list<any>("library/model-lab/market-calibration-reports",50),list<any>("library/learning-cycles",200),
  list<any>("library/agent-task-queue",200)
 ]);
 const ordered=smoke.slice().sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt));
 const latestByDepartment=new Map<string,any>();
 for(const item of ordered)if(item.departmentId&&!latestByDepartment.has(item.departmentId))latestByDepartment.set(item.departmentId,item);
 const departments=WIN_DEPARTMENTS.map(d=>{
  const test=latestByDepartment.get(d.id)||null;
  return {id:d.id,name:d.name,status:test?.result||"not_tested",lastTestAt:test?.createdAt||null,error:test?.message||null,providerStatus:test?.providerStatus||null,chargedUsd:test?.chargedUsd??null};
 });
 const verifiedCoupons=coupons.filter((x:any)=>x.origin==="win"&&approved(x)&&goodOutcome.has(x.outcome));
 const verifiedWins=verifiedCoupons.filter((x:any)=>x.outcome==="won").length;
 const verifiedLosses=verifiedCoupons.filter((x:any)=>x.outcome==="lost").length;
 const candidateLessons=lessons.filter((x:any)=>!validatedLesson(x)&&!["rejected","rejected_by_reviewer"].includes(x.validationStatus));
 const validated=lessons.filter(validatedLesson);
 const verifiedResults=verifiedCoupons;
 const now=Date.now(),day=86400000;
 const recent=verifiedResults.filter((x:any)=>timeOf(x.independentSettlementReview?.reviewedAt||x.settledAt)>=now-30*day);
 const prior=verifiedResults.filter((x:any)=>{const t=timeOf(x.independentSettlementReview?.reviewedAt||x.settledAt);return t>=now-60*day&&t<now-30*day;});
 const hit=(xs:any[])=>xs.length?xs.filter(x=>x.outcome==="won").length/xs.length:null;
 const recentRate=hit(recent),priorRate=hit(prior);
 const trend=recent.length>=10&&prior.length>=10?(recentRate>priorRate+0.02?"higher_than_previous_30_days":recentRate<priorRate-0.02?"lower_than_previous_30_days":"similar_to_previous_30_days"):"insufficient_verified_sample";
 const mistakes=validated.filter((x:any)=>x.recordType==="post_match_diagnostic_candidate").slice().sort((a:any,b:any)=>timeOf(b.independentReview?.reviewedAt)-timeOf(a.independentReview?.reviewedAt)).slice(0,12).map((x:any)=>({
  id:x.id,title:x.title,
  note:x.independentReview?.reviewerNotes||x.note||x.observation,
  diagnosticQuestions:x.note||null,sport:x.sport||null,competition:x.competition||null,
  outcome:x.outcome,reviewedAt:x.independentReview?.reviewedAt||null,evidence:x.independentReview?.evidence||[]
 }));
 const pendingReview=lessonCases.filter((x:any)=>x.reviewStatus==="pending_independent_review").length+
  humanCases.filter((x:any)=>x.reviewStatus==="pending_independent_review").length+
  winCases.filter((x:any)=>x.reviewStatus==="pending_independent_review").length;
 const operationsComplete=reviewOps.filter((x:any)=>x.status==="completed").length;
 const activeReviewer=Boolean(reviewerConfig?.status==="active"&&reviewerConfig?.tokenHash);
 return {
  generatedAt:new Date().toISOString(),
  auditReadPolicy:{mode:"bounded_recent_sample",note:"Overview aggregates are computed from bounded recent record samples to keep read-only MCP requests within the function response window. Use list_win_audit_records for collection inspection; overview counts and rates are sample-bounded."},
  system:{status:"online",departments,departmentsTested:departments.filter(x=>x.status!=="not_tested").length,departmentsPassed:departments.filter(x=>x.status==="passed").length},
  liveResearch:{status:Netlify.env.get("WIN_AI_BUDGET_APPROVED")==="true"&&!budget.spendingLocked?"enabled":"locked",approvalFlag:Netlify.env.get("WIN_AI_BUDGET_APPROVED")==="true",spendingLocked:budget.spendingLocked,aiCallsAllowed:Netlify.env.get("WIN_AI_BUDGET_APPROVED")==="true"&&!budget.spendingLocked},
  reviewer:{status:operationsComplete?"review_recorded":activeReviewer?"credential_created_waiting_for_review":"credential_not_created",activeCredentialConfigured:activeReviewer,pendingCases:pendingReview,pendingLessonCases:lessonCases.filter((x:any)=>x.reviewStatus==="pending_independent_review").length,pendingHumanCouponCases:humanCases.filter((x:any)=>x.reviewStatus==="pending_independent_review").length,pendingWinCouponCases:winCases.filter((x:any)=>x.reviewStatus==="pending_independent_review").length,completedOperations:operationsComplete,interruptedOperations:reviewOps.filter((x:any)=>x.status==="in_progress"||x.status==="failed").length,note:"Credential separation is not proof of a different human identity. A different trusted reviewer must review a real case."},
  learning:{
   verifiedWins,verifiedLosses,independentlyValidatedLessons:validated.length,candidateLessons:candidateLessons.length,
   verifiedCouponOutcomes:verifiedResults.length,verifiedCouponWinRate:verifiedResults.length?Number((hit(verifiedResults)!*100).toFixed(1)):null,
   performanceTrend:trend,recent30Day:{count:recent.length,winRate:recentRate===null?null:Number((recentRate*100).toFixed(1))},
   prior30Day:{count:prior.length,winRate:priorRate===null?null:Number((priorRate*100).toFixed(1))},
   trendCaveat:"Descriptive whole-coupon rate for independently reviewed WIN research forecasts only. It is not selection-level accuracy, calibrated probability or betting ROI. At least 10 reviewed outcomes in each 30-day period are required for a trend.",
   mistakesIdentified:mistakes.length,mistakes,
   learningCycles:cycles.length,completedLearningCycles:cycles.filter((x:any)=>x.status==="completed").length,
   queuedEntityAgents:agentTasks.filter((x:any)=>x.status==="queued").length,completedEntityAgentTasks:agentTasks.filter((x:any)=>x.status==="completed").length
  },
  postMatch:{...postMatch,automaticBetting:false,aiCalls:0},
  openSources:{status:sourceDiscovery.status,lastDiscoveryAt:sourceDiscovery.lastCheck,indexes:sourceDiscovery.indexes||["Hugging Face","GitHub","Zenodo","DataCite"],totalCandidates:sourceDiscovery.totalCandidates,byIndex:sourceDiscovery.byIndex,openLicenseCandidates:sourceDiscovery.openLicenseCandidates,awaitingTermsAndSchemaReview:sourceDiscovery.reviewRequired,approvedForAdapterReview:sourceDiscovery.approvedForAdapterReview,downloadsPerformedByDiscovery:sourceDiscovery.latestRun?.downloadsPerformed??0,latestFailures:sourceDiscovery.latestRun?.failures?.slice(0,8)||[],note:"Public metadata discovery only; licensing, provenance, schema and terms must be verified before any dataset adapter downloads content."},
  datasets:{
   historicalEventDatasets:eventData.length,historicalEventRows:eventData.reduce((n:number,x:any)=>n+Number(x.totalRows||0),0),scoredEventRows:eventData.reduce((n:number,x:any)=>n+Number(x.scoredRows||0),0),
   consensusDatasets:consensusData.length,consensusMarketRows:consensusData.reduce((n:number,x:any)=>n+Number(x.totalRows||0),0),
   observedMarketSnapshots:observedData.length,observedMarketRows:observedData.reduce((n:number,x:any)=>n+Number(x.recordCount||0),0),
   playerEventDatasets:playerData.length,playerEventRows:playerData.reduce((n:number,x:any)=>n+Number(x.totalRows||0),0),
   settledObservedMarketDatasets:settledMarketData.length,settledObservedMarketRows:settledMarketData.reduce((n:number,x:any)=>n+Number(x.settledSelectionCount||0),0),
   calibrationReports:calibration.length
  },
  budget:{month:budget.month,spentUsd:budget.spentUsd,reservedUsd:budget.reservedUsd,remainingUsd:budget.remainingUsd,operatingStopUsd:budget.operatingStopUsd,calls:budget.calls,blockedCalls:budget.blockedCalls,spendingLocked:budget.spendingLocked}
 };
}
