// Shared abuse-protection helpers for the API routes.
// Files in /api starting with "_" are treated as helpers, not routes, by Vercel.

export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

// Only allow requests that originate from the site itself (blocks other sites
// and most scripted/direct abuse of the endpoints). Origin can be spoofed by a
// determined actor, so this is a filter, not a hard guarantee.
export function sameOrigin(req) {
  const host = req.headers["host"];
  if (!host) return false;
  const matches = (v) => { if (!v) return false; try { return new URL(v).host === host; } catch { return false; } };
  return matches(req.headers["origin"]) || matches(req.headers["referer"]);
}

// Best-effort in-memory per-IP rate limit. Serverless instances are ephemeral,
// so this bounds bursts on a warm instance rather than being a global guarantee.
const buckets = new Map();
export function rateLimit(ip, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + windowMs }; buckets.set(ip, b); }
  b.count++;
  if (buckets.size > 5000) { for (const [k, v] of buckets) { if (now > v.resetAt) buckets.delete(k); } }
  return { ok: b.count <= limit, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

// Runs the standard checks; returns true if the request may proceed, otherwise
// writes the appropriate error response and returns false.
export function guard(req, res, { limit = 20, windowMs = 60000 } = {}) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return false; }
  if (!sameOrigin(req)) { res.status(403).json({ error: "forbidden_origin" }); return false; }
  const rl = rateLimit(clientIp(req), limit, windowMs);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); res.status(429).json({ error: "rate_limited", retryAfter: rl.retryAfter }); return false; }
  return true;
}
