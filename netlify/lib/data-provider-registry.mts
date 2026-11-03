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
};

export const DATA_PROVIDER_REGISTRY: ProviderRecord[] = [
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
