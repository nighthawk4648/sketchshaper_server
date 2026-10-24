/**
 * Helper to build comprehensive cache tag sets for catalog mutations
 * (Asset, SubCategory, Category).
 *
 * Rules:
 * 1. Always includes root collection tags: "assets", "sub-categories", "categories".
 * 2. Formats per-ID tags:
 *    - asset-:id
 *    - subcategory-:id
 *    - category-:id
 * 3. Dedupes all entries.
 * 4. Filters out falsy values (null, undefined, false, 0, "") and NaN.
 * 5. Accepts both single values and arrays.
 *
 * @param {Object} options
 * @param {Array<number|string>|number|string} [options.assetIds]
 * @param {Array<number|string>|number|string} [options.subCategoryIds]
 * @param {Array<number|string>|number|string} [options.categoryIds]
 * @param {string[]} [options.extraTags]
 * @returns {string[]} Array of unique tag strings
 */
export function buildCatalogTags({
  assetIds = [],
  subCategoryIds = [],
  categoryIds = [],
  extraTags = [],
} = {}) {
  const tags = new Set(["assets", "sub-categories", "categories"]);

  const cleanId = (id) => {
    if (id === null || id === undefined || id === "" || id === false) return null;
    const num = Number(id);
    if (Number.isNaN(num) || num <= 0) return null;
    return String(id).trim();
  };

  const toList = (val) => {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
  };

  toList(assetIds).forEach((id) => {
    const valid = cleanId(id);
    if (valid) tags.add(`asset-${valid}`);
  });

  toList(subCategoryIds).forEach((id) => {
    const valid = cleanId(id);
    if (valid) tags.add(`subcategory-${valid}`);
  });

  toList(categoryIds).forEach((id) => {
    const valid = cleanId(id);
    if (valid) tags.add(`category-${valid}`);
  });

  toList(extraTags).forEach((tag) => {
    if (typeof tag === "string" && tag.trim()) {
      tags.add(tag.trim());
    }
  });

  return Array.from(tags);
}
