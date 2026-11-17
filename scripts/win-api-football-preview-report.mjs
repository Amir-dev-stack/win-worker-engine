/** Research-only preview reporting helpers. No network or persistent side effects. */
export function previewStatShape(records, resource) {
  if (!Array.isArray(records)) throw new TypeError('Invalid provider record array');
  const keys = new Set();
  const statisticTypes = new Set();
  let teams = 0;
  let players = 0;
  let statsRows = 0;
  for (const record of records.slice(0, 32)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const key of Object.keys(record)) keys.add(key);
    if (resource === 'fixtures/statistics' && Array.isArray(record.statistics)) {
      teams++;
      statsRows += record.statistics.length;
      for (const stat of record.statistics) {
        if (stat && typeof stat.type === 'string') statisticTypes.add(stat.type.slice(0, 64));
      }
    }
    if (resource === 'fixtures/players' && Array.isArray(record.players)) {
      teams++;
      players += record.players.length;
      for (const p of record.players.slice(0, 8)) {
        if (Array.isArray(p.statistics)) statsRows += p.statistics.length;
      }
    }
  }
  return {
    topLevelKeys:[...keys].sort().slice(0, 40),
    teamEntries:teams,
    playerEntries:players,
    observedStatisticRows:statsRows,
    teamStatisticTypes:[...statisticTypes].sort().slice(0, 80),
    sampleBounded: records.length > 32
  };
}

export function isAllowedPreviewContext(context) {
  return context === 'deploy-preview';
}
