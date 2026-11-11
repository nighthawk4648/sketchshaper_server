/**
 * On-Demand Frontend Cache Revalidation Utility
 *
 * Pings the Next.js frontend /api/revalidate endpoint to purge cached tags and paths
 * whenever data is created, updated, or deleted in the backend database.
 * Callers do not wait for it. Failures are retried, then logged (see `pm2 logs`).
 */

const RETRY_DELAYS_MS = [500, 2000]; // 3 attempts in total

// Call once at startup so a missing secret is noticed on boot, not on the first admin save
export function checkRevalidateConfig() {
  if (process.env.REVALIDATION_SECRET) return;
  const message =
    "[revalidate] REVALIDATION_SECRET is not set: the website cache will NOT be purged after admin changes.";
  if (process.env.MODE === "dev") console.warn(message);
  else console.error(message);
}

async function send(url, secret, body, retryDelays) {
  let lastError;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-secret": secret,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      lastError = new Error(`frontend answered HTTP ${res.status}`);
      if (res.status < 500) break; // a wrong secret or bad payload will not fix itself
    } catch (err) {
      lastError = err; // frontend down or restarting: worth retrying
    }
  }
  console.error(
    `[revalidate] FAILED, website cache not purged: ${lastError.message}. Payload: ${body}`,
  );
}

export async function revalidateFrontend(
  tags = [],
  paths = [],
  { retryDelays = RETRY_DELAYS_MS } = {},
) {
  const url =
    process.env.FRONTEND_REVALIDATE_URL ||
    (process.env.MODE === "dev"
      ? "http://localhost:3000/api/revalidate"
      : "https://www.sketchshaper.com/api/revalidate");

  const secret = process.env.REVALIDATION_SECRET;
  if (!secret) return; // already reported at startup by checkRevalidateConfig()

  const cleanTags = [...new Set([].concat(tags).filter(Boolean))];
  const cleanPaths = [...new Set([].concat(paths).filter(Boolean))];
  if (cleanTags.length === 0 && cleanPaths.length === 0) return;

  return send(
    url,
    secret,
    JSON.stringify({ tags: cleanTags, paths: cleanPaths }),
    retryDelays,
  );
}

export default revalidateFrontend;
