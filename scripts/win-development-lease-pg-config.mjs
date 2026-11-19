// Strip libpq environment variables: PGHOSTADDR/PGSERVICE could override
// localhost and connect to a remote database even with psql -h 127.0.0.1.
// Only the validated explicit local URL may determine the destination.
export function inspectLocalPgConfig(raw, parentEnvironment = process.env) {
  if (!raw) throw Error("ISOLATED_POSTGRES_TEST_DATABASE_URL_REQUIRED");
  let url;
  try { url = new URL(raw); } catch { throw Error("INVALID_ISOLATED_TEST_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    (url.port && url.port !== "5432") || url.search || url.hash ||
    !/^\/win_lease_test_[a-z0-9_]{1,45}$/.test(url.pathname) ||
    !url.username || !url.password) throw Error("UNSAFE_POSTGRES_TEST_DESTINATION");
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!/^[A-Za-z0-9_]{1,60}$/.test(user) ||
      password.length < 1 || password.length > 256 ||
      /[\u0000-\u001f]/.test(password))
    throw Error("UNSAFE_POSTGRES_TEST_DESTINATION");
  const environment = {};
  for (const [key,value] of Object.entries(parentEnvironment)) {
    if (!/^PG/i.test(key) && !/^DATABASE_URL$/i.test(key) &&
        !/^WIN_LEASE_(?:LOCAL_PG_TEST|TEST_DATABASE_URL)$/i.test(key))
      environment[key] = value;
  }
  environment.PGPASSWORD = password;
  environment.PGCONNECT_TIMEOUT = "4";
  environment.PGSSLMODE = "disable";
  // Leave all inherited PG routing variables absent, not empty strings;
  // libpq can interpret an explicitly empty setting differently from unset.
  environment.PGPASSFILE = process.platform === "win32" ? "NUL" : "/dev/null";
  return {
    options:["-X","-qAt","-v","ON_ERROR_STOP=1",
      "-h",url.hostname,"-p","5432","-U",user,"-d",url.pathname.slice(1)],
    environment
  };
}
