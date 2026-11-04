const arr = value => Array.isArray(value) ? value : [];
const clean = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : null;

function teamName(value) {
  if (typeof value === "string") return clean(value, 120);
  const team = object(value);
  return clean(team?.name || team?.display_name || team?.short_name || team?.title, 120);
}
function readScore(value, aliases) {
  for (const key of aliases) {
    const candidate = value?.[key];
    if (candidate !== null && candidate !== undefined && candidate !== "" && Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }
  return null;
}
function firstObject(...values) {
  return values.map(object).find(Boolean) || {};
}

export function extractSportScoreMatchRows(payload) {
  const body = object(payload) || {};
  const data = object(body.data);
  if (Array.isArray(body.matches)) return body.matches;
  if (Array.isArray(data?.matches)) return data.matches;
  if (Array.isArray(body.results)) return body.results;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.events)) return body.events;
  if (Array.isArray(data?.events)) return data.events;
  return [];
}

export function normalizeSportScoreMatch(row, sport) {
  const item = object(row);
  if (!item) return null;
  const home = teamName(item.home_team || item.homeTeam || item.home || item.team_home || item.participant1);
  const away = teamName(item.away_team || item.awayTeam || item.away || item.team_away || item.participant2);
  if (!home || !away) return null;

  const fixture = firstObject(item.fixture);
  const competition = firstObject(item.competition, item.league, item.tournament, item.series);
  const scoreObject = firstObject(item.score, item.scores, item.result);
  const homeScore = readScore(scoreObject, ["home", "home_score", "homeScore", "team1", "participant1"]) ??
    readScore(item, ["home_score", "homeScore", "score_home", "score1"]);
  const awayScore = readScore(scoreObject, ["away", "away_score", "awayScore", "team2", "participant2"]) ??
    readScore(item, ["away_score", "awayScore", "score_away", "score2"]);
  const id = item.id ?? item.match_id ?? fixture.id ?? item.event_id ?? null;
  const slug = clean(item.slug || item.match_slug || item.matchSlug || fixture.slug, 180);
  const status = clean(item.status?.name || item.status || item.match_status || fixture.status, 80);
  const startsAt = clean(
    item.start_time || item.startTime || item.kickoff || item.kick_off ||
    item.match_date || item.date || item.datetime || item.utc_date ||
    fixture.date || fixture.start_time,
    80
  );
  const venue = teamName(item.venue || item.stadium || fixture.venue || fixture.stadium);
  const compName = clean(
    competition.name || competition.title || item.competition_name || item.league_name || item.tournament_name,
    160
  );
  const round = clean(item.round || item.stage || item.matchday, 80);
  const isScored = homeScore !== null && awayScore !== null;

  return {
    id: id === null ? null : String(id).slice(0, 120),
    slug: slug || null,
    sport,
    event: home + " vs " + away,
    homeTeam: home,
    awayTeam: away,
    homeScore,
    awayScore,
    scoreAvailable: isScored,
    status: status || "unknown",
    startsAt: startsAt || null,
    timeSemantics: "source_supplied_unverified",
    competition: compName || null,
    round: round || null,
    venue: venue || null,
    sourceProvider: "sportscore-live",
    sourceUrl: "https://sportscore.com/developers/",
    sourceRetrievedAt: null,
    resultIndependentlyVerified: false
  };
}

export function normalizeSportScorePayload(payload, sport, retrievedAt = new Date().toISOString()) {
  const rows = extractSportScoreMatchRows(payload);
  const matches = rows.map(row => normalizeSportScoreMatch(row, sport)).filter(Boolean).slice(0, 15);
  const summary = {
    rowsReceived: rows.length,
    matchesNormalized: matches.length,
    rowsSkipped: Math.max(0, rows.length - matches.length)
  };
  return {
    sport,
    fetchedAt: retrievedAt,
    matches,
    summary,
    attribution: {
      label: "Powered by SportScore",
      url: "https://sportscore.com/",
      rel: "dofollow"
    },
    qualityNote: "SportScore aggregates upstream sports sources. Scores, fixture times and player statistics can change. WIN must corroborate important evidence independently; this feed is not a sole source of truth or an independent settlement decision."
  };
}
