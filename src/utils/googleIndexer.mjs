import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sanitizeSlug } from "./slugHelper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Candidate paths for service account JSON key file
function resolveKeyFilePath() {
  const customPath = process.env.GOOGLE_INDEXING_KEY_PATH;
  if (customPath) {
    return fs.existsSync(customPath) ? customPath : null;
  }

  const rootDir = path.resolve(__dirname, "../../");
  const candidates = [
    path.join(rootDir, "google-indexing-key.json"),
    path.join(rootDir, "service-account-key.json"),
    path.join(rootDir, "google-service-account.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const authCache = new Map();

/**
 * Returns GoogleAuth instance for the resolved key file
 */
export function getGoogleAuthClient() {
  const keyFilePath = resolveKeyFilePath();
  if (!keyFilePath) {
    return null;
  }

  if (authCache.has(keyFilePath)) {
    return authCache.get(keyFilePath);
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ["https://www.googleapis.com/auth/indexing"],
    });
    authCache.set(keyFilePath, auth);
    return auth;
  } catch (err) {
    console.warn("[Google Indexing] Failed to initialize GoogleAuth:", err.message);
    return null;
  }
}

/**
 * Checks whether valid Google credentials are ready to use
 */
export function isGoogleAuthAvailable() {
  return !!getGoogleAuthClient();
}

/**
 * Gets normalized base site URL for indexing
 */
export function getSiteUrl() {
  return (
    process.env.GOOGLE_INDEXING_SITE_URL || "https://www.sketchshaper.com"
  ).replace(/\/$/, "");
}

/**
 * Checks if automatic indexing notification should fire
 */
export function isIndexingEnabled() {
  return (
    process.env.MODE === "prod" ||
    process.env.ENABLE_GOOGLE_INDEXING === "true"
  );
}

/**
 * Builds the canonical 3-tier URL for an asset
 * https://www.sketchshaper.com/[category]/[subcategory]/[slug]-[id]
 */
export function buildCanonicalAssetUrl(asset) {
  if (!asset || !asset.id) return null;

  const normalizedDomain = getSiteUrl();

  const catSlug =
    sanitizeSlug(
      asset.sub_category?.category?.slug,
      asset.sub_category?.category?.name
    ) || "category";

  const subCatSlug =
    sanitizeSlug(
      asset.sub_category?.slug,
      asset.sub_category?.name
    ) || "subcategory";

  const assetSlug =
    sanitizeSlug(asset.slug, asset.name) || "asset";

  return `${normalizedDomain}/${catSlug}/${subCatSlug}/${assetSlug}-${asset.id}`;
}

/**
 * Submits a single URL notification directly to Google's Indexing API
 * @param {string} targetUrl - Absolute URL to submit
 * @param {"URL_UPDATED"|"URL_DELETED"} type - Notification type
 * @returns {Promise<{ ok: boolean, status?: number, quotaExceeded?: boolean, permissionDenied?: boolean, skipped?: boolean, message?: string, data?: any }>}
 */
export async function notifyGoogleUrl(targetUrl, type = "URL_UPDATED") {
  if (!targetUrl || typeof targetUrl !== "string") {
    return { ok: false, message: "Invalid target URL" };
  }

  const auth = getGoogleAuthClient();
  if (!auth) {
    console.warn(
      `[Google Indexing] Skipped: Service account key file not found. Place 'google-indexing-key.json' in backend root to enable.`
    );
    return { ok: false, skipped: true };
  }

  try {
    const client = await auth.getClient();
    const indexing = google.indexing({
      version: "v3",
      auth: client,
    });

    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url: targetUrl,
        type,
      },
    });

    console.log(
      `[Google Indexing] ✅ ${type} submitted successfully for: ${targetUrl} (HTTP ${response.status})`
    );
    return { ok: true, status: response.status, data: response.data };
  } catch (error) {
    const status = error?.response?.status ?? error?.code;
    const message = error?.response?.data?.error?.message || error.message;
    console.warn(`[Google Indexing] ❌ Failed to submit ${targetUrl}:`, message);
    return {
      ok: false,
      status,
      quotaExceeded: status === 429 || /quota/i.test(message),
      permissionDenied: status === 403,
      message,
    };
  }
}

/**
 * Non-blocking fire-and-forget asset notification
 * Resolves the canonical URL and notifies Google in background
 * @param {object} asset - Asset with sub_category and category relations
 * @param {"URL_UPDATED"|"URL_DELETED"} type
 */
export function notifyGoogleAsset(asset, type = "URL_UPDATED") {
  if (!isIndexingEnabled()) {
    console.log(
      "[Google Indexing] Skipped automatic notification in development mode (MODE=dev). Set ENABLE_GOOGLE_INDEXING=true to override."
    );
    return { skipped: true };
  }

  try {
    const url = buildCanonicalAssetUrl(asset);
    if (url) {
      // Fire-and-forget: do not block or delay API controller responses
      notifyGoogleUrl(url, type).catch((err) => {
        console.warn("[Google Indexing] Background submission error:", err.message);
      });
      return { skipped: false, url };
    }
    return { skipped: true, error: "Could not build canonical URL" };
  } catch (err) {
    console.warn("[Google Indexing] Failed to build canonical URL:", err.message);
    return { skipped: true, error: err.message };
  }
}
