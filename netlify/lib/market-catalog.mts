/**
 * WIN bookmaker-independent market catalogue.
 *
 * A market family describes a possible market type, not guaranteed availability.
 * Real offerings are event-, bookmaker-, competition-, jurisdiction- and
 * time-dependent. Provider adapters must store observed offerings separately.
 */
export type MarketPeriod =
  | "full_event" | "regulation" | "first_half" | "second_half"
  | "quarter" | "period" | "inning" | "set" | "map" | "round"
  | "player_performance" | "race" | "tournament" | "unknown";

export type SettlementKind =
  | "two_way" | "three_way" | "double_chance" | "draw_no_bet"
  | "asian_line" | "european_handicap" | "exact_outcome"
  | "range" | "yes_no" | "each_way" | "dead_heat"
  | "combination" | "provider_defined";

export type MarketFamilyDefinition = {
  id: string;
  label: string;
  description: string;
  periods: MarketPeriod[];
  settlement: SettlementKind;
  supportsLine: boolean;
  supportsPlayer: boolean;
  supportsBuilder: boolean;
};

const common: MarketFamilyDefinition[] = [
  { id:"event_winner", label:"Event winner / match result", description:"Winner or result of the event.", periods:["full_event","regulation","set","map","round"], settlement:"three_way", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"double_chance", label:"Double chance", description:"Any two of the available result outcomes.", periods:["full_event","regulation","first_half"], settlement:"double_chance", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"draw_no_bet", label:"Draw no bet", description:"A draw returns the stake where the sport and market support a draw.", periods:["full_event","regulation"], settlement:"draw_no_bet", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"handicap", label:"Handicap / spread", description:"A virtual head start or deficit applied to a participant.", periods:["full_event","regulation","first_half","second_half","quarter","period","set","map","inning"], settlement:"asian_line", supportsLine:true, supportsPlayer:false, supportsBuilder:true },
  { id:"three_way_handicap", label:"Three-way handicap", description:"Handicap result with home/away/draw outcomes after adjustment.", periods:["full_event","regulation"], settlement:"european_handicap", supportsLine:true, supportsPlayer:false, supportsBuilder:true },
  { id:"total_points", label:"Total points / score", description:"Over/under total for the event or a defined segment.", periods:["full_event","regulation","first_half","second_half","quarter","period","inning","set","map","round"], settlement:"asian_line", supportsLine:true, supportsPlayer:false, supportsBuilder:true },
  { id:"participant_total", label:"Team / participant total", description:"Over/under score for one named participant or side.", periods:["full_event","regulation","first_half","second_half","quarter","period","inning","set","map"], settlement:"asian_line", supportsLine:true, supportsPlayer:false, supportsBuilder:true },
  { id:"exact_score", label:"Exact score / correct score", description:"Predict the exact final or segment score.", periods:["full_event","regulation","first_half","set","map"], settlement:"exact_outcome", supportsLine:false, supportsPlayer:false, supportsBuilder:false },
  { id:"score_band", label:"Score band / multi-score", description:"A selection covering a defined group or range of scores.", periods:["full_event","regulation"], settlement:"range", supportsLine:true, supportsPlayer:false, supportsBuilder:false },
  { id:"both_sides_score", label:"Both sides to score", description:"Whether each side records at least one score/goal/point where applicable.", periods:["full_event","regulation","first_half","second_half"], settlement:"yes_no", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"odd_even", label:"Odd / even", description:"Parity of the final score or a specified statistic.", periods:["full_event","regulation","first_half","second_half","quarter","period","inning","set"], settlement:"two_way", supportsLine:false, supportsPlayer:false, supportsBuilder:false },
  { id:"half_time_full_time", label:"Segment result / full-time result", description:"Combined result across two specified periods.", periods:["full_event","regulation","first_half","second_half"], settlement:"combination", supportsLine:false, supportsPlayer:false, supportsBuilder:false },
  { id:"result_and_total", label:"Result + total combination", description:"Combined event result and total score condition.", periods:["full_event","regulation"], settlement:"combination", supportsLine:true, supportsPlayer:false, supportsBuilder:true },
  { id:"result_and_both_score", label:"Result + both sides score", description:"Combined event result and both-sides-scoring condition.", periods:["full_event","regulation"], settlement:"combination", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"winning_period", label:"Win at least one period", description:"Whether a participant wins at least one specified period.", periods:["full_event","first_half","second_half","quarter","period","set","map"], settlement:"yes_no", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"period_total", label:"Period-specific total", description:"Total score in a half, quarter, period, inning, set, map or round.", periods:["first_half","second_half","quarter","period","inning","set","map","round"], settlement:"asian_line", supportsLine:true, supportsPlayer:false, supportsBuilder:true },
  { id:"period_result", label:"Period winner / result", description:"Result within a specified segment.", periods:["first_half","second_half","quarter","period","inning","set","map","round"], settlement:"three_way", supportsLine:false, supportsPlayer:false, supportsBuilder:true },
  { id:"player_prop", label:"Player performance", description:"A named player's statistical performance or achievement.", periods:["full_event","regulation","first_half","second_half","quarter","period","set","map","round","player_performance"], settlement:"asian_line", supportsLine:true, supportsPlayer:true, supportsBuilder:true },
  { id:"participant_to_score", label:"Named participant to score / achieve", description:"Whether a named player, athlete or participant records a defined event.", periods:["full_event","regulation","first_half","second_half","quarter","period","inning","round"], settlement:"yes_no", supportsLine:false, supportsPlayer:true, supportsBuilder:true },
  { id:"outright", label:"Outright / tournament winner", description:"Winner or finishing position in a competition or tournament.", periods:["tournament","race"], settlement:"dead_heat", supportsLine:false, supportsPlayer:true, supportsBuilder:false },
  { id:"head_to_head", label:"Head-to-head matchup", description:"Which of two named participants finishes ahead or wins.", periods:["full_event","tournament","race"], settlement:"two_way", supportsLine:false, supportsPlayer:true, supportsBuilder:false },
  { id:"finish_position", label:"Finishing position / top N", description:"Whether a participant finishes within a specified position range.", periods:["race","tournament"], settlement:"range", supportsLine:true, supportsPlayer:true, supportsBuilder:false },
  { id:"each_way_place", label:"Each-way / place", description:"Win and place components with provider-defined terms.", periods:["race","tournament"], settlement:"each_way", supportsLine:false, supportsPlayer:true, supportsBuilder:false },
  { id:"method_of_victory", label:"Method of victory", description:"Winning method such as knockout, decision, submission or technical result.", periods:["full_event","round"], settlement:"exact_outcome", supportsLine:false, supportsPlayer:true, supportsBuilder:false },
  { id:"time_duration", label:"Time / duration", description:"Duration, completion time or time-based threshold.", periods:["full_event","race","round","tournament"], settlement:"asian_line", supportsLine:true, supportsPlayer:true, supportsBuilder:false },
  { id:"special_event", label:"Special / novelty market", description:"A sport- or event-specific proposition not covered by a standard family.", periods:["full_event","regulation","race","tournament","unknown"], settlement:"provider_defined", supportsLine:false, supportsPlayer:false, supportsBuilder:false }
];

const sportSpecific: Record<string, string[]> = {
  football:["corners","cards","shots","shots_on_target","fouls","offsides","saves","both_teams_to_score","team_to_score_both_halves","win_to_nil","goal_intervals","first_goal","last_goal","goal_scorer","assist","own_goal","penalty_awarded","penalty_scored"],
  futsal:["accumulated_fouls","team_fouls","power_play_goals"],
  basketball:["rebounds","assists","three_pointers","steals","blocks","turnovers","double_double","triple_double","quarter_winner","race_to_points"],
  tennis:["aces","double_faults","break_points","service_breaks","set_score","games_won","tiebreak"],
  ice_hockey:["shots_on_goal","goalie_saves","power_play_goals","penalty_minutes","hits","blocked_shots","period_winner"],
  baseball:["hits","home_runs","rbis","pitcher_strikeouts","runs_scored","first_five_innings","total_bases","stolen_bases"],
  american_football:["passing_yards","rushing_yards","receiving_yards","touchdowns","receptions","interceptions","sacks","field_goals_made","first_downs"],
  rugby:["tries","first_try","conversions","penalties_scored","drop_goals","tackles","meters_gained"],
  cricket:["top_batter","top_bowler","runs","wickets","overs","boundaries","sixes","maidens","toss_winner","partnership_runs"],
  volleyball:["sets_won","set_score","total_points","aces","blocks","attack_points"],
  handball:["player_goals","saves","exclusions","penalty_goals","fast_break_goals"],
  boxing_mma:["significant_strikes","total_strikes","takedowns","knockdowns","submission_attempts","fight_goes_distance","round_completed"],
  motorsport:["fastest_lap","safety_car","pit_stops","qualifying_position","driver_matchup","podium"],
  golf:["birdies","eagles","bogeys","round_score","hole_winner","top_5","top_10","top_20"],
  darts:["180s","highest_checkout","checkout_percentage","leg_handicap","set_handicap"],
  snooker:["centuries","highest_break","maximum_break","frame_handicap"],
  table_tennis:["first_game","total_points","correct_set_score"],
  badminton:["game_handicap","total_rallies"],
  esports:["map_winner","map_handicap","rounds_won","kills","deaths","assists","first_blood","bomb_plants","objectives"],
  cycling:["stage_winner","mountain_classification","points_classification","sprint_winner"],
  water_sports:["medal_winner","heat_winner","qualify_for_final","time_record"],
  athletics:["medal_winner","qualify_for_final","record_broken","finish_time"],
  horse_racing:["win","place","each_way","forecast","tricast","without_favourite","match_betting"],
  greyhound_racing:["win","place","forecast","tricast","trap_winner","match_betting"],
  field_hockey:["penalty_corners","cards","team_goals"],
  water_polo:["quarter_winner","exclusions","player_goals"],
  lacrosse:["goals","assists","faceoffs","ground_balls","penalty_minutes"],
  floorball:["period_winner","player_points","penalty_minutes"],
  squash_padel:["game_handicap","set_handicap","total_games","correct_score"],
  winter_sports:["podium","head_to_head","top_n","finish_time","medal_winner"]
};

export type ObservedMarket = {
  providerId: string;
  bookmakerId: string;
  sportId: string;
  eventId: string;
  providerMarketId?: string;
  providerMarketName: string;
  canonicalMarketId: string;
  period: MarketPeriod;
  line?: number | string;
  participantId?: string;
  selectionName: string;
  oddsDecimal: number;
  observedAt: string;
  startsAt?: string;
  live: boolean;
  sourceRecordId: string;
  settlementRulesRef?: string;
  availabilityStatus: "open" | "suspended" | "closed" | "unknown";
};

export function listMarketFamilies(sportId: string): MarketFamilyDefinition[] {
  const specific = (sportSpecific[sportId] || []).map(id => ({
    id,
    label: id.split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    description: "Sport-specific market family; exact outcomes, period and settlement are defined by the observed bookmaker offering.",
    periods: ["full_event", "regulation", "first_half", "second_half", "quarter", "period", "inning", "set", "map", "round", "player_performance", "race", "tournament", "unknown"] as MarketPeriod[],
    settlement: "provider_defined" as SettlementKind,
    supportsLine: true,
    supportsPlayer: /player|scorer|assist|rebounds|points|yards|strikeouts|saves|goals|kills|deaths|aces|fouls|cards/.test(id),
    supportsBuilder: true
  }));
  return [...common, ...specific];
}

export function listSportSpecificMarketIds(sportId: string): string[] {
  return [...(sportSpecific[sportId] || [])];
}

export function validateObservedMarket(m: ObservedMarket): string[] {
  const errors: string[] = [];
  if (!m.providerId.trim()) errors.push("providerId_required");
  if (!m.bookmakerId.trim()) errors.push("bookmakerId_required");
  if (!m.sportId.trim()) errors.push("sportId_required");
  if (!m.eventId.trim()) errors.push("eventId_required");
  if (!m.providerMarketName.trim()) errors.push("providerMarketName_required");
  if (!m.canonicalMarketId.trim()) errors.push("canonicalMarketId_required");
  if (!m.selectionName.trim()) errors.push("selectionName_required");
  if (!Number.isFinite(m.oddsDecimal) || m.oddsDecimal <= 1) errors.push("invalid_decimal_odds");
  if (!Number.isFinite(Date.parse(m.observedAt))) errors.push("invalid_observedAt");
  if (!m.sourceRecordId.trim()) errors.push("sourceRecordId_required");
  return errors;
}

/** Combination builders are event-scoped. Correlation and bookmaker pricing
 * must be preserved; never multiply leg prices to invent a Bet Builder price. */
export type BuilderLeg = {
  eventId: string;
  canonicalMarketId: string;
  selectionName: string;
  line?: number | string;
  period: MarketPeriod;
};

export function validateBuilderLegs(legs: BuilderLeg[]): string[] {
  if (legs.length < 2) return ["builder_requires_at_least_two_legs"];
  const eventIds = new Set(legs.map(x => x.eventId));
  if (eventIds.size !== 1) return ["builder_legs_must_share_event"];
  return [];
}
