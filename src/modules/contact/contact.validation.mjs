export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^[+\d\s().-]{6,30}$/;
export const VALID_STATUSES = ["NEW", "READ", "ARCHIVED"];
export const VALID_SERVICE_TYPES = [
  "architecture",
  "single-model",
  "textures",
  "extension",
  "support",
];

/**
 * Trims a value and returns null for empty / non-string input.
 */
export const toOptionalString = (val, max = 255) => {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

/**
 * Normalizes a client-supplied cloud link. Auto-prefixes https:// to bare links
 * and only accepts http(s) URLs whose hostname contains a dot.
 * Returns null when the URL is empty or invalid.
 */
export const normalizeReferenceUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let url = rawUrl.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    return url.slice(0, 2048);
  } catch (err) {
    return null;
  }
};

/**
 * Builds the Prisma `where` clause for the admin list.
 * service_type: undefined => no filter, null => messages with no service type.
 */
export const buildContactWhere = ({ status, service_type } = {}) => ({
  ...(status && { status }),
  ...(service_type !== undefined && { service_type }),
});
