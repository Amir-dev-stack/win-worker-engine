/** Read Netlify runtime secrets/config, with process.env fallback for local tests. */
export function getRuntimeEnv(name: string): string | undefined {
  try {
    const value = Netlify.env.get(name);
    if (typeof value === "string" && value.length) return value;
  } catch {
    // Netlify global is unavailable outside the hosted runtime.
  }
  const fallback = process.env[name];
  return typeof fallback === "string" && fallback.length ? fallback : undefined;
}
