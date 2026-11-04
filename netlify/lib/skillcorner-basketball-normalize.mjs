const IDENTITY_COLUMNS = new Set([
  "competition_id","competition_name","season_id","season_name",
  "player_id","player_name","team_id","team_name","games_played"
]);

function parseCell(value) {
  const cell = String(value ?? "").trim();
  if (!cell) return null;
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cell)) {
    const number = Number(cell);
    return Number.isFinite(number) ? number : cell;
  }
  return cell;
}

export function parseSkillCornerCsv(csvText, aggregateType, source = {}) {
  if (typeof csvText !== "string" || !csvText.trim()) throw new Error("skillcorner_csv_empty");
  if (!["shots","drives","picks"].includes(aggregateType)) throw new Error("skillcorner_aggregate_type_invalid");
  const rows = [];
  let row = [], field = "", quoted = false;
  const input = csvText.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field); field = "";
      if (row.some(value => String(value).trim() !== "")) rows.push(row);
      row = [];
    } else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("skillcorner_csv_unclosed_quote");
  if (field.length || row.length) {
    row.push(field);
    if (row.some(value => String(value).trim() !== "")) rows.push(row);
  }
  if (rows.length < 2) throw new Error("skillcorner_csv_has_no_data_rows");
  const headers = rows[0].map((value, index) => index === 0 ? String(value).trim() : String(value).trim());
  for (const required of ["player_id","player_name","team_name","competition_name","season_name","games_played"]) {
    if (!headers.includes(required)) throw new Error("skillcorner_csv_missing_column:" + required);
  }
  const records = [];
  for (const cells of rows.slice(1)) {
    if (records.length >= 1000) throw new Error("skillcorner_csv_row_limit_exceeded");
    if (!cells.some(value => String(value).trim() !== "")) continue;
    const item = {};
    headers.forEach((header, index) => { item[header] = parseCell(cells[index]); });
    if (item.player_id === null || !String(item.player_name || "").trim() || !String(item.team_name || "").trim()) continue;
    const statistics = {};
    for (const [key, value] of Object.entries(item)) if (!IDENTITY_COLUMNS.has(key)) statistics[key] = value;
    records.push({
      playerId: String(item.player_id),
      player: String(item.player_name).trim(),
      teamId: item.team_id === null ? null : String(item.team_id),
      team: String(item.team_name).trim(),
      isSeasonTotalRow: item.team_id === null || String(item.team_name).trim().toLowerCase() === "total",
      competitionId: item.competition_id === null ? null : String(item.competition_id),
      competition: String(item.competition_name).trim(),
      seasonId: item.season_id === null ? null : String(item.season_id),
      season: String(item.season_name).trim(),
      gamesPlayed: Number(item.games_played || 0),
      aggregateType,
      statistics,
      sourceProvider: "skillcorner-open-basketball-acb-2025-26",
      sourceUrl: source.sourceUrl || "https://github.com/SkillCorner/opendata-basketball",
      retrievedAt: source.retrievedAt || new Date().toISOString(),
      origin: "provider_historical_data"
    });
  }
  if (!records.length) throw new Error("skillcorner_csv_has_no_valid_player_rows");
  return {
    aggregateType,
    headers,
    totalRows: records.length,
    uniquePlayers: new Set(records.map(x => x.playerId)).size,
    uniqueTeams: new Set(records.filter(x => !x.isSeasonTotalRow).map(x => x.teamId || x.team)).size,
    records
  };
}
