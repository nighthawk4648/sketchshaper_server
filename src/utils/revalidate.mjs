/**
 * On-Demand Frontend Cache Revalidation Utility
 *
 * Pings the Next.js frontend /api/revalidate endpoint to purge cached tags and paths
 * whenever data is created, updated, or deleted in the backend database.
 */

export async function revalidateFrontend(tags = [], paths = []) {
  const url =
    process.env.FRONTEND_REVALIDATE_URL ||
    (process.env.MODE === "dev"
      ? "http://localhost:3000/api/revalidate"
      : "https://www.sketchshaper.com/api/revalidate");

  const secret = process.env.REVALIDATION_SECRET;

  // If secret is not set yet, skip gracefully without crashing
  if (!secret) {
    return;
  }

  const cleanTags = Array.isArray(tags)
    ? tags.filter(Boolean)
    : tags
    ? [tags]
    : [];
  const cleanPaths = Array.isArray(paths)
    ? paths.filter(Boolean)
    : paths
    ? [paths]
    : [];

  if (cleanTags.length === 0 && cleanPaths.length === 0) return;

  // Non-blocking fire-and-forget: do not wait or delay the API response
  try {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags: cleanTags, paths: cleanPaths }),
      signal: AbortSignal.timeout(5000), // 5-second timeout
    })
      .then(async (res) => {
        if (!res.ok) {
          console.warn(
            `[Revalidate Warning] Frontend returned HTTP ${res.status}`
          );
        }
      })
      .catch((err) => {
        // Log softly without disrupting backend server operations
        console.warn("[Revalidate Warning] Webhook unreachable:", err.message);
      });
  } catch (err) {
    console.warn("[Revalidate Warning] Fetch dispatch failed:", err.message);
  }
}

export default revalidateFrontend;

