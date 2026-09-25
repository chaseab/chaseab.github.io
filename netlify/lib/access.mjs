// Who may call the private APIs.
// chasebonfiglio.com sits behind Cloudflare Access: every request must carry a valid Access JWT
// (Cf-Access-Jwt-Assertion) for Chase's email or the worker's service token. Checking the token here,
// not just trusting Cloudflare, means nobody gets in by sending Host: chasebonfiglio.com straight to Netlify.
// Any other host (*.netlify.app previews, deploy permalinks) gets the old shared key, read-only.
// Env: CF_ACCESS_TEAM (e.g. chasebonfiglio.cloudflareaccess.com), CF_ACCESS_AUD (the app's AUD tag),
// CF_ACCESS_EMAILS (comma list), CF_ACCESS_SERVICE_IDS (comma list of service token client ids), NOTES_KEY.

const PROD_HOSTS = new Set(["chasebonfiglio.com", "www.chasebonfiglio.com"]);
const list = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

let certs = { team: "", at: 0, keys: [] };
async function keysFor(team) {
  if (certs.team === team && Date.now() - certs.at < 3600e3) return certs.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs ${r.status}`);
  certs = { team, at: Date.now(), keys: (await r.json()).keys || [] };
  return certs.keys;
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cookie = (req, name) => (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

// Returns the token's claims, or null if it isn't a valid Access token for this app.
async function verify(token, env) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(h)));
    const claims = JSON.parse(new TextDecoder().decode(b64url(p)));
    if (header.alg !== "RS256") return null;
    let jwk = (await keysFor(env.team)).find((k) => k.kid === header.kid);
    if (!jwk) { certs.at = 0; jwk = (await keysFor(env.team)).find((k) => k.kid === header.kid); }   // key rotated
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    const now = Date.now() / 1000;
    const aud = [].concat(claims.aud || []);
    if (!ok || !aud.includes(env.aud) || claims.iss !== `https://${env.team}` || !(claims.exp > now) || (claims.nbf && claims.nbf > now + 60)) return null;
    return claims;
  } catch { return null; }
}

// -> { ok: true, who, readOnly } or { ok: false, status, error }
export async function authorize(req, { previewKey = true } = {}) {
  const host = new URL(req.url).hostname.toLowerCase();
  if (!PROD_HOSTS.has(host)) {
    const key = Netlify.env.get("NOTES_KEY");
    if (previewKey && key && req.headers.get("x-notes-key") === key) return { ok: true, who: "preview-key", readOnly: true };
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const env = { team: Netlify.env.get("CF_ACCESS_TEAM"), aud: Netlify.env.get("CF_ACCESS_AUD") };
  if (!env.team || !env.aud) return { ok: false, status: 503, error: "access not configured" };   // fail closed
  const claims = await verify(req.headers.get("cf-access-jwt-assertion") || cookie(req, "CF_Authorization"), env);
  if (!claims) return { ok: false, status: 401, error: "cloudflare access login required" };
  const email = String(claims.email || "").toLowerCase();
  if (email && list(Netlify.env.get("CF_ACCESS_EMAILS")).includes(email)) return { ok: true, who: email, readOnly: false };
  const cn = String(claims.common_name || "").toLowerCase();
  if (!email && cn && list(Netlify.env.get("CF_ACCESS_SERVICE_IDS")).includes(cn)) return { ok: true, who: `service:${cn}`, readOnly: false };
  return { ok: false, status: 403, error: "not allowed" };
}
