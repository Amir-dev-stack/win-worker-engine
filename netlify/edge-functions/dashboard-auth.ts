const COOKIE_NAME = "win_dashboard_session";
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function makeSession(expiry: number, secret: string): Promise<string> {
  const payload = "v1:" + expiry;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload)));
  return String(expiry) + "." + base64UrlEncode(signature);
}

async function validSession(value: string, secret: string): Promise<boolean> {
  const [expiryText, signatureText, extra] = value.split(".");
  if (extra !== undefined || !/^\d{10}$/.test(expiryText || "")) return false;
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) return false;
  const signature = base64UrlDecode(signatureText || "");
  if (!signature || signature.length !== 32) return false;
  try {
    return await crypto.subtle.verify("HMAC", await signingKey(secret), signature, encoder.encode("v1:" + expiry));
  } catch {
    return false;
  }
}

async function constantTimeTextEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < aa.length; index++) difference |= aa[index] ^ bb[index];
  return difference === 0;
}

function readCookie(request: Request, name: string): string {
  const prefix = name + "=";
  for (const item of (request.headers.get("cookie") || "").split(";")) {
    const cookie = item.trim();
    if (cookie.startsWith(prefix)) return decodeURIComponent(cookie.slice(prefix.length));
  }
  return "";
}

function secureCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return COOKIE_NAME + "=" + value + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; SameSite=Strict" + secure;
}

function responseHeaders(): Headers {
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
}

function loginPage(message = ""): Response {
  const safeMessage = message.replace(/[&<>"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  })[character] || character);
  const html = [
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>WIN · Secure access</title>",
    "<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090d17;color:#eef2ff;font:16px system-ui,sans-serif;padding:24px}",
    "main{width:min(100%,420px);padding:32px;border:1px solid #293449;border-radius:18px;background:#111827;box-shadow:0 24px 80px #0008}",
    ".mark{font-weight:800;letter-spacing:.16em;color:#9fb8ff;font-size:13px}h1{margin:18px 0 8px;font-size:28px}p{color:#aab5c8;line-height:1.55}",
    "label{display:block;margin:24px 0 8px;font-size:13px;color:#cbd5e1}input{width:100%;padding:14px;border-radius:9px;border:1px solid #475569;background:#080d18;color:#fff;font:inherit}",
    "button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:9px;background:#9fb8ff;color:#101827;font-weight:700;font:inherit;cursor:pointer}.error{color:#fecaca;margin-top:12px;font-size:14px}small{display:block;margin-top:20px;color:#718096}</style>",
    "</head><body><main><div class=\"mark\">WIN · WORKER ENGINE</div><h1>Private dashboard</h1>",
    "<p>Enter the dashboard password to continue. API and ChatGPT connection permissions are handled separately.</p>",
    "<form method=\"post\" action=\"/__win_dashboard_login\"><label for=\"password\">Dashboard password</label>",
    "<input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"current-password\" required autofocus>",
    "<button type=\"submit\">Unlock dashboard</button></form>",
    safeMessage ? "<div class=\"error\" role=\"alert\">" + safeMessage + "</div>" : "",
    "<small>Sessions expire automatically after 8 hours.</small></main></body></html>"
  ].join("");
  return new Response(html, { status: message ? 401 : 200, headers: responseHeaders() });
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const url = new URL(request.url);
  const password = Netlify.env.get("WIN_DASHBOARD_PASSWORD") || "";
  const sessionSecret = Netlify.env.get("WIN_DASHBOARD_SESSION_SECRET") || "";

  // Fail closed: missing configuration must never make the dashboard public.
  if (password.length < 32 || sessionSecret.length < 32) {
    return new Response("WIN dashboard access is not configured. Set WIN_DASHBOARD_PASSWORD and WIN_DASHBOARD_SESSION_SECRET as secret Netlify environment variables, then redeploy.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }

  if (url.pathname === "/__win_dashboard_login") {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (request.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });
    let supplied = "";
    try {
      const form = await request.formData();
      supplied = String(form.get("password") || "");
    } catch {
      return loginPage("Invalid login request.");
    }
    if (supplied.length > 512 || !await constantTimeTextEqual(supplied, password)) {
      return loginPage("Incorrect password.");
    }
    const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const session = await makeSession(expiry, sessionSecret);
    const headers = new Headers({
      "location": "/",
      "cache-control": "no-store",
      "set-cookie": secureCookie(request, session, SESSION_SECONDS)
    });
    return new Response(null, { status: 303, headers });
  }

  if (url.pathname === "/__win_dashboard_logout") {
    const headers = new Headers({
      "location": "/",
      "cache-control": "no-store",
      "set-cookie": secureCookie(request, "", 0)
    });
    return new Response(null, { status: 303, headers });
  }

  const session = readCookie(request, COOKIE_NAME);
  if (session && await validSession(session, sessionSecret)) return context.next();
  return loginPage();
};

export const config = {
  path: "/*",
  excludedPath: ["/api/*", "/mcp", "/oauth/*", "/.well-known/*", "/.netlify/*"]
};
