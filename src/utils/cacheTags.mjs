// Cache tags the website attaches to backend data, and which ones each change must purge.
// Tag names must match nighthawkk-noyon/src/utils/cacheConfig.js.

export const TAG = {
  assets: "assets",
  categories: "categories",
  subCategories: "sub-categories",
  nav: "nav", // categories/nav: names and asset counts in the navbar, footer and sidebar
  general: "general",
  pages: "pages",
  social: "social",
  supportedBy: "supportedby",
  sliders: "sliders",
  innovative: "innovative",
  blogs: "blogs",
  asset: (id) => `asset-${id}`,
  category: (id) => `category-${id}`,
  subCategory: (id) => `subcategory-${id}`,
  blog: (id) => `blog-${id}`,
};

const unique = (tags) => [...new Set(tags.filter(Boolean))];

// One asset was created, updated, deleted or moved. `subCategoryIds` / `categoryIds` are the
// places it sits in (old and new when moved). `countChanged` is true when the number of
// assets in a place changed (create, delete, move): only then do the nav counts change.
export function assetTags({
  id,
  subCategoryIds = [],
  categoryIds = [],
  countChanged = false,
  linked = [],
}) {
  return unique([
    TAG.assets,
    TAG.asset(id),
    ...subCategoryIds.map(TAG.subCategory),
    ...categoryIds.map(TAG.category),
    countChanged && TAG.nav,
    ...linked,
  ]);
}

// A category or sub-category changed. Its name and slug appear in the nav, in listings and in
// every asset's breadcrumb, so this is a broad purge on purpose (rare admin action).
export function categoryTags({ categoryIds = [], subCategoryId } = {}) {
  return unique([
    TAG.categories,
    TAG.subCategories,
    TAG.assets,
    ...categoryIds.map(TAG.category),
    subCategoryId && TAG.subCategory(subCategoryId),
  ]);
}
