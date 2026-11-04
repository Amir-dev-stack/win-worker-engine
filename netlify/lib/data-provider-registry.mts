/**
 * WIN autonomous sports-data source registry.
 * Entries are research candidates until an adapter successfully retrieves data
 * and terms/licensing have been reviewed. Registration is NOT connectivity.
 */
export type ProviderAccessMode =
  | "open_download" | "open_api" | "licensed_api" | "manual_authorized_import"
  | "research_candidate" | "not_approved";

export type ProviderRecord = {
  id: string;
  name: string;
  website: string;
  sports: string[];
  dataDomains: string[];
  accessMode: ProviderAccessMode;
  historicalSupport: "documented" | "possible" | "unknown" | "not_available";
  authentication: "none" | "api_key" | "account_or_contract" | "manual";
  licenceReview: "required" | "documented_open_terms" | "approved";
  automationAllowed: boolean;
  notes: string;
  licenceReference?: string;
  attribution?: string;
};

export const DATA_PROVIDER_REGISTRY: ProviderRecord[] = [
  {
    id:"sharpapi-sample-data", name:"SharpAPI multi-source sample odds", website:"https://github.com/Sharp-API/SharpAPI-Sample-Data",
    sports:["football","baseball"], dataDomains:["observed_bookmaker_odds","market_catalogue","multi_source_price_snapshots"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://creativecommons.org/licenses/by/4.0/",
    attribution:"SharpAPI (sharpapi.io), Sports Betting Odds Sample Dataset — CC BY 4.0.",
    notes:"Two static CC BY 4.0 snapshots: 6,132 World Cup prices across 20 sources and 3,673 MLB prices across 14 sources. Preserve sportsbook/exchange/prediction-market identity; snapshots are not live odds or settled results. Attribution required."
  },
  {
    id:"openfootball-worldcup-json", name:"OpenFootball World Cup JSON", website:"https://github.com/openfootball/worldcup.json",
    sports:["football"], dataDomains:["fixtures","results","goalscorers","lineups","substitutions","bookings","venues","player_events"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://github.com/openfootball/worldcup.json/blob/master/LICENSE.md",
    attribution:"OpenFootball worldcup.json — CC0 1.0.",
    notes:"CC0 public-domain data for men's World Cups 1930–2026 and 2025 Club World Cup. Full match files include scorer, lineup, substitution and booking events where available. Upstream is community-maintained, not a guaranteed live feed."
  },
  {
    id:"football-data-co-uk", name:"Football-Data.co.uk", website:"https://www.football-data.co.uk/",
    sports:["football"], dataDomains:["fixtures","results","historical_odds","match_statistics"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"required", automationAllowed:false,
    notes:"Public downloadable historical football CSVs; validate per-season columns, completeness and reuse terms before automated ingestion."
  },
  {
    id:"openfootball", name:"OpenFootball football.json", website:"https://github.com/openfootball/football.json",
    sports:["football"], dataDomains:["fixtures","results","competition_metadata"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://github.com/openfootball/football.json/blob/master/LICENSE.md",
    attribution:"OpenFootball football.json — CC0 1.0.",
    notes:"Specific football.json dataset documents CC0/public-domain data. Adapter stores source URL, retrieval timestamp and SHA-256 checksum; this approval does not extend to every OpenFootball repository."
  },

  {
    id:"hf-minmaxxxer-nfl-2026", name:"Hugging Face — NFL 2026 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nfl-odds-2026",
    sports:["american_football"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nfl-odds-2026",
    attribution:"Min Maxxxer, Hugging Face dataset nfl-odds-2026 — CC BY 4.0.",
    notes:"CC BY 4.0 dataset; consensus opening/closing moneyline probabilities, spreads, totals and settled results. Bookmaker identities and individual prices are not included."
  },
  {
    id:"hf-minmaxxxer-nba-2025-26", name:"Hugging Face — NBA 2025/26 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nba-closing-lines-ats-2025-26",
    sports:["basketball"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nba-closing-lines-ats-2025-26",
    attribution:"Min Maxxxer, Hugging Face dataset nba-closing-lines-ats-2025-26 — CC BY 4.0.",
    notes:"CC BY 4.0 dataset; consensus opening/closing moneyline probabilities, spreads, totals and settled results. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-nba-2026-27", name:"Hugging Face — NBA 2026/27 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nba-odds-2026-27",
    sports:["basketball"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nba-odds-2026-27",
    attribution:"Min Maxxxer, Hugging Face dataset nba-odds-2026-27 — CC BY 4.0.",
    notes:"CC BY 4.0 dataset; current-season consensus opening/closing lines and results as published. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-epl-2025-26", name:"Hugging Face — Premier League 2025/26 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/premier-league-closing-odds-2025-26",
    sports:["football"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/premier-league-closing-odds-2025-26",
    attribution:"Min Maxxxer, Hugging Face dataset premier-league-closing-odds-2025-26 — CC BY 4.0.",
    notes:"CC BY 4.0 dataset; consensus opening/closing 1X2, totals, BTTS and Asian handicap lines with results. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-epl-2026-27", name:"Hugging Face — Premier League 2026/27 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/premier-league-odds-2026-27",
    sports:["football"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/premier-league-odds-2026-27",
    attribution:"Min Maxxxer, Hugging Face dataset premier-league-odds-2026-27 — CC BY 4.0.",
    notes:"CC BY 4.0 dataset; current-season consensus opening/closing 1X2, totals, BTTS and Asian handicap lines with results. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-nhl-2026-27", name:"Hugging Face — NHL 2026/27 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nhl-odds-2026-27",
    sports:["ice_hockey"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nhl-odds-2026-27",
    attribution:"Min Maxxxer, Hugging Face dataset nhl-odds-2026-27 — CC BY 4.0.",
    notes:"CC BY 4.0 consensus opening/closing moneyline, puck-line and total probabilities with settled results. Bookmaker identities and individual prices are not included."
  },
  {
    id:"hf-minmaxxxer-nfl-2025", name:"Hugging Face — NFL 2025 closing lines", website:"https://huggingface.co/datasets/minmaxxxer/nfl-closing-lines-ats-2025",
    sports:["american_football"], dataDomains:["historical_consensus_moneyline","spread","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nfl-closing-lines-ats-2025",
    attribution:"Min Maxxxer, Hugging Face dataset nfl-closing-lines-ats-2025 — CC BY 4.0.",
    notes:"285 NFL games, CC BY 4.0. Consensus opening/closing probabilities and graded moneyline, spread and total outcomes; not individual bookmaker prices."
  },
  {
    id:"hf-minmaxxxer-nba-2024-25", name:"Hugging Face — NBA 2024/25 closing lines", website:"https://huggingface.co/datasets/minmaxxxer/nba-closing-lines-ats-2024-25",
    sports:["basketball"], dataDomains:["historical_consensus_moneyline","spread","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nba-closing-lines-ats-2024-25",
    attribution:"Min Maxxxer, Hugging Face dataset nba-closing-lines-ats-2024-25 — CC BY 4.0.",
    notes:"About 1,310 NBA games, CC BY 4.0. Consensus opening/closing probabilities and graded results; not individual bookmaker prices."
  },
  {
    id:"hf-minmaxxxer-nhl-2025-26", name:"Hugging Face — NHL 2025/26 closing odds", website:"https://huggingface.co/datasets/minmaxxxer/nhl-closing-odds-2025-26",
    sports:["ice_hockey"], dataDomains:["historical_consensus_moneyline","puck_line","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/nhl-closing-odds-2025-26",
    attribution:"Min Maxxxer, Hugging Face dataset nhl-closing-odds-2025-26 — CC BY 4.0.",
    notes:"1,394 NHL games, CC BY 4.0. Consensus opening/closing probabilities and graded moneyline, puck-line and totals; overtime/shootout included as described by dataset."
  },
  {
    id:"hf-minmaxxxer-mlb-2025", name:"Hugging Face — MLB 2025 closing odds", website:"https://huggingface.co/datasets/minmaxxxer/mlb-closing-odds-2025",
    sports:["baseball"], dataDomains:["historical_consensus_moneyline","run_line","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/mlb-closing-odds-2025",
    attribution:"Min Maxxxer, Hugging Face dataset mlb-closing-odds-2025 — CC BY 4.0.",
    notes:"2,480 MLB games, CC BY 4.0. Consensus opening/closing probabilities and graded moneyline, run-line and totals; extra innings included."
  },
  {
    id:"hf-minmaxxxer-top3-europe-2025-26", name:"Hugging Face — LaLiga, Serie A and Bundesliga 2025/26", website:"https://huggingface.co/datasets/minmaxxxer/laliga-serie-a-bundesliga-closing-odds-2025-26",
    sports:["football"], dataDomains:["historical_consensus_1x2","totals","btts","asian_handicap","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/laliga-serie-a-bundesliga-closing-odds-2025-26",
    attribution:"Min Maxxxer, Hugging Face dataset laliga-serie-a-bundesliga-closing-odds-2025-26 — CC BY 4.0.",
    notes:"1,066 matches across three European leagues, CC BY 4.0. Consensus market probabilities and graded outcomes; bookmaker-level prices are not included."
  },
  {
    id:"hf-minmaxxxer-atp-wta-2025", name:"Hugging Face — ATP/WTA 2025 closing odds", website:"https://huggingface.co/datasets/minmaxxxer/atp-wta-closing-odds-2025",
    sports:["tennis"], dataDomains:["historical_match_winner_probabilities","fair_closing_odds","best_available_closing_price","match_results","player_metadata"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://huggingface.co/datasets/minmaxxxer/atp-wta-closing-odds-2025",
    attribution:"Min Maxxxer, Hugging Face dataset atp-wta-closing-odds-2025 — CC BY 4.0.",
    notes:"5,791 ATP/WTA singles matches, CC BY 4.0. Includes consensus fair prices and best available closing prices, but the best-price bookmaker identity is not supplied; retired and walkover matches must be excluded from ordinary settlement calibration."
  },
  {
    id:"tipsaudit-track-record-public",
    name:"TipsAudit public pre-match 1X2 track record",
    website:"https://github.com/tipsaudit/track-record-public",
    sports:["football"],
    dataDomains:["historical_pre_match_predictions","model_probabilities","pinnacle_prices","closing_line_value","bookmaker_margins","timestamped_track_record_snapshots"],
    accessMode:"research_candidate", historicalSupport:"documented", authentication:"none",
    licenceReview:"required", automationAllowed:false,
    licenceReference:"https://github.com/tipsaudit/track-record-public/blob/main/LICENSE",
    attribution:"TipsAudit — https://tipsaudit.com",
    notes:"Candidate only. The repository states CC BY 4.0 and publishes a monthly 1X2 CSV plus daily immutable JSON snapshots, a SHA-256 manifest and OpenTimestamps proofs. Before ingestion, verify that each prediction is present in a snapshot captured before its kick-off and that the snapshot hash matches the manifest; newest timestamp proofs may still be pending. Exclude void rows. Do not treat source-reported results or CLV as independent ground truth. Its documented CLV is raw-price versus raw-price, best-soft fields include exchanges, earlier best-soft history may contain look-ahead, and Betfair venue labelling was mixed through 2026-10-15. Dataset-specific data rights and methodology remain under review; no automatic download or ingestion."
  },
  {
    id:"api-sports", name:"API-SPORTS (API-Football and other sport APIs)", website:"https://api-sports.io/",
    sports:["football","basketball","american_football"],
    dataDomains:["fixtures","results","competition_standings","team_match_statistics","player_match_statistics","player_ratings","play_by_play_events","lineups","injuries","team_season_statistics","player_season_statistics"],
    accessMode:"licensed_api", historicalSupport:"possible", authentication:"api_key",
    licenceReview:"required", automationAllowed:false,
    notes:"Deep-statistics commercial API candidate. Official docs describe football fixture team stats, halftime splits, events, lineups, player match statistics and provider-defined ratings; Basketball player game stats; and American-football play-by-play and position-group player statistics. Actual coverage, historical depth, rating definitions, quotas, price and reuse rights must be verified for each sport/competition/season and account before any adapter is enabled."
  },
  {
    id:"statsbomb-open-data", name:"StatsBomb Open Data", website:"https://github.com/hudl/open-data",
    sports:["football"],
    dataDomains:["selected_competitions_historical_matches","match_events","lineups","selected_match_360_data"],
    accessMode:"research_candidate", historicalSupport:"documented", authentication:"none",
    licenceReview:"required", automationAllowed:false,
    notes:"Publicly shared event and lineup JSON for selected competitions/seasons, plus 360 data for selected matches. Attribution/brand requirements apply; coverage is selective, updates are not guaranteed live, and commercial player/season IQ metrics are not the same as the open event files. Terms and reuse rights must be reviewed before automated ingestion."
  },
  {
    id:"sportmonks", name:"Sportmonks", website:"https://www.sportmonks.com/",
    sports:["football","cricket"], dataDomains:["fixtures","results","teams","players","lineups","statistics","odds"],
    accessMode:"licensed_api", historicalSupport:"possible", authentication:"api_key",
    licenceReview:"required", automationAllowed:false,
    notes:"Commercial API candidate; actual historical depth, competition coverage, endpoints and plan entitlements require account-level verification."
  },
  {
    id:"the-odds-api", name:"The Odds API", website:"https://the-odds-api.com/",
    sports:["football","basketball","tennis","ice_hockey","baseball","american_football","other_supported_sports"],
    dataDomains:["prematch_odds","live_odds","historical_odds","market_catalogue"],
    accessMode:"licensed_api", historicalSupport:"documented", authentication:"api_key",
    licenceReview:"required", automationAllowed:false,
    notes:"Historical odds availability varies by sport, market, timestamp and plan; confirm terms and quota before enabling."
  },
  {
    id:"sportradar", name:"Sportradar", website:"https://developer.sportradar.com/",
    sports:["multi_sport"], dataDomains:["fixtures","results","statistics","players","lineups","injuries","odds","live_data"],
    accessMode:"licensed_api", historicalSupport:"possible", authentication:"account_or_contract",
    licenceReview:"required", automationAllowed:false,
    notes:"Broad commercial data candidate; product-specific sports, markets, historical archives, redistribution rights and price require contract review."
  },
  {
    id:"sportsdataio", name:"SportsDataIO", website:"https://sportsdata.io/",
    sports:["football","basketball","baseball","american_football","hockey","other_supported_sports"],
    dataDomains:["fixtures","results","statistics","player_props","odds","historical_data"],
    accessMode:"licensed_api", historicalSupport:"possible", authentication:"api_key",
    licenceReview:"required", automationAllowed:false,
    notes:"Commercial candidate; archive access and sport-specific coverage must be verified against plan and contract."
  }

  {
    id:"nflverse-pbp-data", name:"nflverse NFL play-by-play and player statistics", website:"https://github.com/nflverse/nflverse-data",
    sports:["american_football"],
    dataDomains:["historical_match_play_by_play","team_match_statistics","player_match_statistics","player_events","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    licenceReference:"https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
    attribution:"nflverse play-by-play data — CC BY 4.0.",
    notes:"Automated season CSV releases provide NFL play-by-play, game scores and derived passing, rushing, receiving, tackling, turnover and special-teams counts. Attribution is required. The adapter intentionally does not use FTN-specific data fields and does not invent player ratings, lineups, injuries, snap counts or absent statistics. This provider covers American football, not association football."
  },
  {
    id:"uefa-match-center", name:"UEFA official match centres", website:"https://www.uefa.com/uefachampionsleague/",
    sports:["football"],
    dataDomains:["fixtures","results","team_match_statistics","match_timeline","competition_context"],
    accessMode:"research_candidate", historicalSupport:"possible", authentication:"none",
    licenceReview:"required", automationAllowed:false,
    licenceReference:"https://www.uefa.com/",
    attribution:"UEFA — official match centre.",
    notes:"Official reference source for competition fixtures, match reports and selected team statistics. This registry entry is a source pointer only; it does not authorize scraping, bulk downloads or automated reuse. Confirm per-competition availability and terms before building an adapter."
  },
  {
    id:"fotmob-match-profiles", name:"FotMob match profiles", website:"https://www.fotmob.com/",
    sports:["football"],
    dataDomains:["fixtures","results","expected_goals","shot_maps","team_match_statistics","player_match_statistics","player_ratings","match_timeline"],
    accessMode:"research_candidate", historicalSupport:"possible", authentication:"none",
    licenceReview:"required", automationAllowed:false,
    licenceReference:"https://www.fotmob.com/",
    attribution:"FotMob — match profile and statistics.",
    notes:"Reference source for match timelines, shot maps, xG and provider-calculated player ratings where available. No public bulk-data or redistribution permission is assumed; no automated ingestion is enabled."
  },
  {
    id:"espn-match-center", name:"ESPN match centres", website:"https://www.espn.com/soccer/",
    sports:["football","basketball","baseball","american_football","ice_hockey"],
    dataDomains:["fixtures","results","match_timeline","team_match_statistics","player_match_statistics","lineups"],
    accessMode:"research_candidate", historicalSupport:"possible", authentication:"none",
    licenceReview:"required", automationAllowed:false,
    licenceReference:"https://www.espn.com/",
    attribution:"ESPN — match centre and scoreboard data.",
    notes:"Reference destination for event commentary, schedules and sport-specific box scores where published. This entry is not an approved data API and does not permit automated scraping or redistribution."
  },
  {
    id:"footystats-h2h", name:"FootyStats football H2H and trends", website:"https://footystats.org/",
    sports:["football"],
    dataDomains:["historical_results","head_to_head","team_form","competition_statistics","betting_trends"],
    accessMode:"research_candidate", historicalSupport:"possible", authentication:"account_or_contract",
    licenceReview:"required", automationAllowed:false,
    licenceReference:"https://footystats.org/",
    attribution:"FootyStats — historical H2H and trend reference.",
    notes:"Reference source for historical form and H2H summaries. It is not an official governing-body feed; definitions, sample scope, access entitlements and reuse rights must be checked before any automated connection."
  }
];


const IMPORTABLE_ACCESS_MODES = new Set<ProviderAccessMode>(["open_download", "open_api"]);
const PROVIDER_ID_ALIASES: Record<string, string> = {
  "openfootball-football-json": "openfootball"
};

/**
 * Fail-closed guard used by the actual public-data import adapters.
 * This is intentionally distinct from providerMayRunAutomatically(), which
 * also requires a verified live connection for credentialed providers.
 */
export function assertProviderImportAllowed(providerId: string, requiredDomains: string[] = []) {
  const requestedId = typeof providerId === "string" ? providerId.trim() : "";
  const canonicalId = PROVIDER_ID_ALIASES[requestedId] || requestedId;
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === canonicalId);
  if (!provider) throw new Error("provider_import_blocked: provider_not_registered:" + requestedId);
  if (!provider.automationAllowed) throw new Error("provider_import_blocked: automation_disabled:" + canonicalId);
  if (provider.licenceReview !== "approved") throw new Error("provider_import_blocked: licence_review_not_approved:" + canonicalId);
  if (!IMPORTABLE_ACCESS_MODES.has(provider.accessMode)) throw new Error("provider_import_blocked: access_mode_not_importable:" + canonicalId);
  if (!/^https:\/\//i.test(provider.licenceReference || "")) throw new Error("provider_import_blocked: https_licence_reference_missing:" + canonicalId);
  if (!provider.attribution?.trim()) throw new Error("provider_import_blocked: attribution_missing:" + canonicalId);
  const required = [...new Set(requiredDomains.filter(Boolean))];
  const missing = required.filter(domain => !provider.dataDomains.includes(domain));
  if (missing.length) throw new Error("provider_import_blocked: data_domain_not_approved:" + canonicalId + ":" + missing.join(","));
  return provider;
}

export type ProviderConnection = {
  providerId: string;
  status: "candidate" | "terms_review" | "credentials_missing" | "connected" | "paused" | "rejected";
  verifiedAt?: string;
  lastSuccessfulFetchAt?: string;
  lastError?: string;
  enabledDomains: string[];
  approvedBy?: string;
  termsReference?: string;
};

export function getProviderCandidates(sportId?: string) {
  return DATA_PROVIDER_REGISTRY.filter(p =>
    !sportId || p.sports.includes(sportId) || p.sports.includes("multi_sport") || p.sports.includes("other_supported_sports")
  );
}

export function providerMayRunAutomatically(provider: ProviderRecord, connection?: ProviderConnection) {
  const enabledDomains = Array.isArray(connection?.enabledDomains) ? connection.enabledDomains : [];
  const verifiedAt = Date.parse(connection?.verifiedAt || "");
  return provider.automationAllowed &&
    provider.licenceReview === "approved" &&
    provider.accessMode !== "research_candidate" &&
    connection?.providerId === provider.id &&
    connection?.status === "connected" &&
    Number.isFinite(verifiedAt) &&
    enabledDomains.length > 0 &&
    enabledDomains.every(domain => provider.dataDomains.includes(domain)) &&
    /^https:\/\//i.test(connection?.termsReference || "");
}
