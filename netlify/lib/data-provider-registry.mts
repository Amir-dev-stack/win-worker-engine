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
    notes:"Two static CC BY 4.0 snapshots: 6,132 World Cup prices across 20 sources and 3,673 MLB prices across 14 sources. Preserve sportsbook/exchange/prediction-market identity; snapshots are not live odds or settled results. Attribution required."
  },
  {
    id:"openfootball-worldcup-json", name:"OpenFootball World Cup JSON", website:"https://github.com/openfootball/worldcup.json",
    sports:["football"], dataDomains:["fixtures","results","goalscorers","lineups","substitutions","bookings","venues","player_events"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
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
    notes:"Specific football.json dataset documents CC0/public-domain data. Adapter stores source URL, retrieval timestamp and SHA-256 checksum; this approval does not extend to every OpenFootball repository."
  },

  {
    id:"hf-minmaxxxer-nfl-2026", name:"Hugging Face — NFL 2026 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nfl-odds-2026",
    sports:["american_football"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    notes:"CC BY 4.0 dataset; consensus opening/closing moneyline probabilities, spreads, totals and settled results. Bookmaker identities and individual prices are not included."
  },
  {
    id:"hf-minmaxxxer-nba-2025-26", name:"Hugging Face — NBA 2025/26 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nba-closing-lines-ats-2025-26",
    sports:["basketball"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    notes:"CC BY 4.0 dataset; consensus opening/closing moneyline probabilities, spreads, totals and settled results. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-nba-2026-27", name:"Hugging Face — NBA 2026/27 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nba-odds-2026-27",
    sports:["basketball"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    notes:"CC BY 4.0 dataset; current-season consensus opening/closing lines and results as published. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-epl-2025-26", name:"Hugging Face — Premier League 2025/26 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/premier-league-closing-odds-2025-26",
    sports:["football"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    notes:"CC BY 4.0 dataset; consensus opening/closing 1X2, totals, BTTS and Asian handicap lines with results. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-epl-2026-27", name:"Hugging Face — Premier League 2026/27 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/premier-league-odds-2026-27",
    sports:["football"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    notes:"CC BY 4.0 dataset; current-season consensus opening/closing 1X2, totals, BTTS and Asian handicap lines with results. Not bookmaker-level raw odds."
  },
  {
    id:"hf-minmaxxxer-nhl-2026-27", name:"Hugging Face — NHL 2026/27 closing-line consensus", website:"https://huggingface.co/datasets/minmaxxxer/nhl-odds-2026-27",
    sports:["ice_hockey"], dataDomains:["historical_consensus_market_lines","results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none",
    licenceReview:"approved", automationAllowed:true,
    notes:"CC BY 4.0 consensus opening/closing moneyline, puck-line and total probabilities with settled results. Bookmaker identities and individual prices are not included."
  },
  {
    id:"hf-minmaxxxer-nfl-2025", name:"Hugging Face — NFL 2025 closing lines", website:"https://huggingface.co/datasets/minmaxxxer/nfl-closing-lines-ats-2025",
    sports:["american_football"], dataDomains:["historical_consensus_moneyline","spread","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    notes:"285 NFL games, CC BY 4.0. Consensus opening/closing probabilities and graded moneyline, spread and total outcomes; not individual bookmaker prices."
  },
  {
    id:"hf-minmaxxxer-nba-2024-25", name:"Hugging Face — NBA 2024/25 closing lines", website:"https://huggingface.co/datasets/minmaxxxer/nba-closing-lines-ats-2024-25",
    sports:["basketball"], dataDomains:["historical_consensus_moneyline","spread","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    notes:"About 1,310 NBA games, CC BY 4.0. Consensus opening/closing probabilities and graded results; not individual bookmaker prices."
  },
  {
    id:"hf-minmaxxxer-nhl-2025-26", name:"Hugging Face — NHL 2025/26 closing odds", website:"https://huggingface.co/datasets/minmaxxxer/nhl-closing-odds-2025-26",
    sports:["ice_hockey"], dataDomains:["historical_consensus_moneyline","puck_line","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    notes:"1,394 NHL games, CC BY 4.0. Consensus opening/closing probabilities and graded moneyline, puck-line and totals; overtime/shootout included as described by dataset."
  },
  {
    id:"hf-minmaxxxer-mlb-2025", name:"Hugging Face — MLB 2025 closing odds", website:"https://huggingface.co/datasets/minmaxxxer/mlb-closing-odds-2025",
    sports:["baseball"], dataDomains:["historical_consensus_moneyline","run_line","totals","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    notes:"2,480 MLB games, CC BY 4.0. Consensus opening/closing probabilities and graded moneyline, run-line and totals; extra innings included."
  },
  {
    id:"hf-minmaxxxer-top3-europe-2025-26", name:"Hugging Face — LaLiga, Serie A and Bundesliga 2025/26", website:"https://huggingface.co/datasets/minmaxxxer/laliga-serie-a-bundesliga-closing-odds-2025-26",
    sports:["football"], dataDomains:["historical_consensus_1x2","totals","btts","asian_handicap","settled_results"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
    notes:"1,066 matches across three European leagues, CC BY 4.0. Consensus market probabilities and graded outcomes; bookmaker-level prices are not included."
  },
  {
    id:"hf-minmaxxxer-atp-wta-2025", name:"Hugging Face — ATP/WTA 2025 closing odds", website:"https://huggingface.co/datasets/minmaxxxer/atp-wta-closing-odds-2025",
    sports:["tennis"], dataDomains:["historical_match_winner_probabilities","fair_closing_odds","best_available_closing_price","match_results","player_metadata"],
    accessMode:"open_download", historicalSupport:"documented", authentication:"none", licenceReview:"approved", automationAllowed:true,
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
];

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
  return provider.automationAllowed &&
    provider.licenceReview === "approved" &&
    provider.accessMode !== "research_candidate" &&
    connection?.status === "connected" &&
    Boolean(connection.verifiedAt) &&
    Boolean(connection.termsReference);
}
