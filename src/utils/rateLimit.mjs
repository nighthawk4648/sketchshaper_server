// shortcut: counts live in this process's memory, fine for one pm2 instance, move to the database or Redis if the API ever runs on several.
export function rateLimiter({ windowMs, max, key }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  timer.unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        status: "error",
        code: 429,
        message: "Too many attempts. Please wait a few minutes and try again.",
      });
    }
    next();
  };
}

// Behind Cloudflare the real visitor address is in CF-Connecting-IP
export const clientIp = (req) =>
  req.get("cf-connecting-ip") ||
  req.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.ip ||
  "unknown";
