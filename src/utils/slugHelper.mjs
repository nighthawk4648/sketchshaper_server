/**
 * Shared slug generation & sanitization utility.
 * - Prioritizes rawSlug if provided and non-empty, otherwise falls back to fallbackText.
 * - Converts to lowercase, replaces invalid characters with hyphens.
 * - Strips leading/trailing hyphens.
 * - Preserves numbers everywhere including suffixes (e.g. "sketchup-2024" is preserved).
 * - Collapses consecutive hyphens into a single hyphen.
 * - Returns clean slug string, or null if input contains no alphanumeric characters.
 */
export const sanitizeSlug = (rawSlug, fallbackText = '') => {
  const source = (rawSlug !== undefined && rawSlug !== null && rawSlug.toString().trim() !== '')
    ? rawSlug
    : (fallbackText || '');

  const cleaned = source
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || null;
};

