import { config } from "../config/config.mjs";

/**
 * Triggers on-demand cache revalidation in Next.js (nighthawkk)
 * Server-to-server call with retry logic and non-blocking failure handling.
 *
 * @param {Object} options
 * @param {string[]|string} options.tags - Tag or array of tags to purge
 * @param {string[]|string} [options.paths] - Path or array of paths to purge
 */
export async function revalidateFrontend({ tags = [], paths = [] }) {
  const frontendUrl =
    process.env.FRONTEND_INTERNAL_URL ||
    config.frontend_url ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000";
  const secret = config.revalidation_secret || process.env.REVALIDATION_SECRET;

  if (!secret) {
    console.warn(
      "[Revalidation] REVALIDATION_SECRET is not configured in server environment. Skipping on-demand cache purge."
    );
    return;
  }

  const tagList = (Array.isArray(tags) ? tags : [tags]).filter(
    (t) => typeof t === "string" && t.trim()
  );
  const pathList = (Array.isArray(paths) ? paths : [paths]).filter(
    (p) => typeof p === "string" && p.trim()
  );

  if (tagList.length === 0 && pathList.length === 0) {
    return;
  }

  const endpoint = `${frontendUrl.replace(/\/+$/, "")}/api/revalidate`;
  const payload = {
    tags: tagList,
    paths: pathList,
  };

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
          "x-revalidate-secret": secret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000), // 6-second timeout per attempt
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        console.log(
          `[Revalidation] Successfully purged cache on attempt ${attempt}:`,
          JSON.stringify({ tags: tagList, paths: pathList, response: data })
        );
        return;
      }

      const status = response.status;
      const errorText = await response.text().catch(() => "");
      console.warn(
        `[Revalidation] Attempt ${attempt}/${maxAttempts} failed with status ${status}: ${errorText}`
      );
    } catch (err) {
      console.warn(
        `[Revalidation] Attempt ${attempt}/${maxAttempts} network/timeout error: ${err.message}`
      );
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.error(
    `[Revalidation] All ${maxAttempts} attempts failed to notify frontend at ${endpoint}. Dynamic fallback TTL will expire naturally.`
  );
}
