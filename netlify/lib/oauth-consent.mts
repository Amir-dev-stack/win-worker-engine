export function describeOAuthScopes(scope: string): string {
  const requested = new Set(scope.split(/\s+/).filter(Boolean));
  const permissions: string[] = [];
  if (requested.has("win:audit")) permissions.push("Read-only diagnostics: observatory status, historical dataset metadata, calibration and settlement records, reviewer operations and learning history. Cannot start research, write records, approve coupons or place bets.");
  if (requested.has("win:read")) permissions.push("Read WIN research records, predictions, tips and library data.");
  if (requested.has("win:research")) permissions.push("Start research runs and submit research/library records. This does not place bets or access an STS account.");
  if (requested.has("offline_access")) permissions.push("Keep the connection active using refresh tokens.");
  return permissions.length ? permissions.join(" ") : "No WIN data or research permissions requested.";
}
