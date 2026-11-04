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

/**
 * Extracts Google Service Account credentials from .env or key file
 * Supports:
 * 1. GOOGLE_SERVICE_ACCOUNT_KEY (JSON or Base64 string in .env)
 * 2. GOOGLE_SERVICE_ACCOUNT_EMAIL & GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (in .env)
 * 3. File fallback (google-indexing-key.json on disk)
 */
function getCredentials() {
  // 1. Check GOOGLE_SERVICE_ACCOUNT_KEY in .env (JSON or Base64)
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (rawKey && rawKey.trim()) {
    try {
      const trimmed = rawKey.trim();
      const decoded = trimmed.startsWith("{")
        ? trimmed
        : Buffer.from(trimmed, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (parsed.client_email && parsed.private_key) {
        return {
          email: parsed.client_email,
          key: parsed.private_key,
          source: "env_service_account_key",
        };
      }
    } catch (e) {
      console.warn("[Google Indexing] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY from env:", e.message);
    }
  }

  // 2. Check individual email and private key env vars
  const envEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const envPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (envEmail && envPrivateKey) {
    return {
      email: envEmail,
      key: envPrivateKey,
      source: "env_individual_vars",
    };
  }

  // 3. Fallback to candidate JSON file on disk
  const keyFilePath = resolveKeyFilePath();
  if (keyFilePath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
      if (parsed.client_email && parsed.private_key) {
        return {
          email: parsed.client_email,
          key: parsed.private_key,
          source: keyFilePath,
        };
      }
    } catch (e) {
      console.warn(`[Google Indexing] Failed to read key file ${keyFilePath}:`, e.message);
    }
  }

  return null;
}

const authCache = new Map();

/**
 * Returns GoogleAuth / JWT client instance
 */
export function getGoogleAuthClient() {
  const creds = getCredentials();
  if (!creds) {
    return null;
  }

  if (authCache.has(creds.source)) {
    return authCache.get(creds.source);
  }

  try {
    const auth = new google.auth.JWT({
      email: creds.email,
      key: creds.key,
      scopes: ["https://www.googleapis.com/auth/indexing"],
    });
    authCache.set(creds.source, auth);
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
      `[Google Indexing] Skipped: Service account credentials not found. Configure GOOGLE_SERVICE_ACCOUNT_KEY in .env or place 'google-indexing-key.json' in backend root to enable.`
    );
    return { ok: false, skipped: true };
  }

  try {
    const client = typeof auth.getClient === "function" ? await auth.getClient() : auth;
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
