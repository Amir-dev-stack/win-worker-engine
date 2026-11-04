const arr = value => Array.isArray(value) ? value : [];
const text = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;

function eventType(event) {
  return text(event?.type?.name, 80).toLowerCase();
}
function personKey(player, team) {
  const id = player?.id ?? "";
  const name = text(player?.name, 180);
  const teamName = text(team?.name, 180);
  if (!name) return "";
  return String(id || name.toLowerCase() + "|" + teamName.toLowerCase());
}

/**
 * Convert one StatsBomb open-data match into WIN's source-attributed event-dossier
 * shape. The match date stays date-only because StatsBomb kick-off timestamps do
 * not include a timezone. Never invent UTC from a local kick-off clock.
 */
export function normalizeStatsBombMatch(match, eventsInput, lineupsInput, source = {}) {
  const matchId = String(match?.match_id ?? "").trim();
  const date = text(match?.match_date, 20);
  const homeTeam = text(match?.home_team?.name, 180);
  const awayTeam = text(match?.away_team?.name, 180);
  if (!/^\d+$/.test(matchId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !homeTeam || !awayTeam) {
    throw new Error("statsbomb_match_identity_invalid");
  }

  const events = arr(eventsInput);
  const lineups = arr(lineupsInput);
  const players = new Map();
  const teamTotals = new Map();
  const eventTypeCounts = {};
  let shots = 0;
  let shotsOnTarget = 0;
  let goals = 0;
  let xgTotal = 0;
  let xgRows = 0;

  const getPlayer = (player, team, position = null) => {
    const key = personKey(player, team);
    if (!key) return null;
    if (!players.has(key)) {
      players.set(key, {
        playerId: player?.id == null ? null : String(player.id),
        player: text(player?.name, 180),
        team: text(team?.name, 180) || null,
        position: text(position?.name, 100) || null,
        statistics: {
          shots: 0, shotsOnTarget: 0, goals: 0, expectedGoals: 0,
          passes: 0, completedPasses: 0, keyPasses: 0,
          tackles: 0, interceptions: 0, pressures: 0, carries: 0,
          dribbles: 0, fouls: 0, yellowCards: 0, redCards: 0
        },
        sourceMetricSemantics: "Counts derived from the StatsBomb event records included with this match; not provider player ratings or minutes."
      });
    } else if (position?.name && !players.get(key).position) {
      players.get(key).position = text(position.name, 100);
    }
    return players.get(key);
  };

  for (const item of lineups) {
    const team = { name: text(item?.team_name, 180) };
    for (const member of arr(item?.lineup)) {
      getPlayer({ id: member?.player_id, name: member?.player_name }, team, { name: member?.positions?.[0]?.position });
    }
  }

  for (const event of events) {
    const type = eventType(event);
    if (!type) continue;
    eventTypeCounts[type] = (eventTypeCounts[type] || 0) + 1;
    const team = event?.team || null;
    const player = event?.player || null;
    const record = getPlayer(player, team, event?.position);
    if (team?.name) {
      const total = teamTotals.get(team.name) || { team: team.name, shots: 0, goals: 0, passes: 0, pressures: 0, fouls: 0 };
      if (type === "shot") total.shots++;
      if (type === "pass") total.passes++;
      if (type === "pressure") total.pressures++;
      if (type === "foul committed") total.fouls++;
      teamTotals.set(team.name, total);
    }

    if (type === "shot") {
      shots++;
      const outcome = text(event?.shot?.outcome?.name, 80).toLowerCase();
      const xg = number(event?.shot?.statsbomb_xg);
      if (outcome === "goal") { goals++; shotsOnTarget++; }
      else if (outcome === "saved") shotsOnTarget++;
      if (xg !== null) { xgTotal += xg; xgRows++; }
      if (record) {
        record.statistics.shots++;
        if (outcome === "goal") record.statistics.goals++;
        if (outcome === "goal" || outcome === "saved") record.statistics.shotsOnTarget++;
        if (xg !== null) record.statistics.expectedGoals += xg;
      }
    } else if (type === "pass" && record) {
      record.statistics.passes++;
      if (!event?.pass?.outcome?.name) record.statistics.completedPasses++;
      if (event?.pass?.shot_assist || event?.pass?.goal_assist) record.statistics.keyPasses++;
    } else if (type === "pressure" && record) {
      record.statistics.pressures++;
    } else if (type === "interception" && record) {
      record.statistics.interceptions++;
    } else if (type === "duel" && text(event?.duel?.type?.name).toLowerCase() === "tackle" && record) {
      record.statistics.tackles++;
    } else if (type === "carry" && record) {
      record.statistics.carries++;
    } else if (type === "dribble" && record) {
      record.statistics.dribbles++;
    } else if (type === "foul committed" && record) {
      record.statistics.fouls++;
    }

    const card = text(event?.foul_committed?.card?.name || event?.bad_behaviour?.card?.name, 50).toLowerCase();
    if (record && card.includes("yellow")) record.statistics.yellowCards++;
    if (record && card.includes("red")) record.statistics.redCards++;
  }

  const homeScore = number(match?.home_score);
  const awayScore = number(match?.away_score);
  const validScore = homeScore !== null && awayScore !== null && Number.isInteger(homeScore) &&
    Number.isInteger(awayScore) && homeScore >= 0 && awayScore >= 0;
  const score = validScore ? [homeScore, awayScore] : null;
  for (const total of teamTotals.values()) {
    total.goals = null;
  }

  const sourceUrl = text(source?.sourceUrl, 1200) || "https://github.com/hudl/open-data";
  return {
    id: "statsbomb-" + matchId,
    eventId: "statsbomb-" + matchId,
    statsbombMatchId: matchId,
    sport: "football",
    competition: text(match?.competition?.competition_name, 180) || null,
    competitionId: number(match?.competition?.competition_id),
    season: text(match?.season?.season_name, 80) || null,
    seasonId: number(match?.season?.season_id),
    event: homeTeam + " vs " + awayTeam,
    homeTeam,
    awayTeam,
    eventStart: date,
    eventStartPrecision: "date_only",
    kickoffLocalTime: text(match?.kick_off, 40) || null,
    kickoffTimezone: null,
    eventTimeNote: "StatsBomb supplies a local kick-off clock without a timezone in this record. It is preserved as source text and is not converted to UTC.",
    fullTimeScore: score,
    scoreSourceSemantics: "StatsBomb match record score; bookmaker-specific settlement rules are not inferred.",
    status: text(match?.match_status, 80) || (score ? "completed" : "unknown"),
    matchWeek: number(match?.match_week),
    competitionStage: text(match?.competition_stage?.name, 120) || null,
    venue: text(match?.stadium?.name, 180) || null,
    referee: text(match?.referee?.name, 180) || null,
    details: {
      events,
      lineups,
      playerStats: [...players.values()],
      statsbombEventSummary: {
        eventCount: events.length,
        eventTypeCounts,
        shots,
        shotsOnTarget,
        goals,
        expectedGoals: xgRows ? Number(xgTotal.toFixed(5)) : null,
        eventsWithExpectedGoals: xgRows,
        teamEventCounts: [...teamTotals.values()],
        lineupsAvailable: lineups.length > 0,
        eventDataAvailable: events.length > 0,
        ratingAvailable: false,
        sourceNote: "xG and event metrics are StatsBomb's event definitions. They are not assumed comparable to another provider's metrics."
      }
    },
    sourceProvider: "statsbomb-open-data",
    sourceUrl,
    sourceFiles: arr(source?.sourceFiles).slice(0, 3),
    retrievedAt: text(source?.retrievedAt, 40) || new Date().toISOString(),
    sourceLicence: "StatsBomb Open Data public research-use terms; not represented as a general-purpose Creative Commons licence.",
    licenceReference: "https://github.com/hudl/open-data#terms--conditions",
    attribution: "Data source: StatsBomb Open Data. If publishing, sharing or distributing analysis derived from this data, cite StatsBomb and use its official logo.",
    origin: "provider_historical_data",
    modelLabOnly: true
  };
}
