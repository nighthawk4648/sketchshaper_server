import test from "node:test";
import assert from "node:assert/strict";
import { TAG, assetTags, categoryTags } from "./cacheTags.mjs";

test("plain asset edit purges the asset and its places, not the nav or settings", () => {
  const tags = assetTags({ id: 5, subCategoryIds: [2], categoryIds: [1], linked: ["asset-9", "blog-3"] });
  assert.deepEqual(tags.sort(), ["asset-5", "asset-9", "assets", "blog-3", "category-1", "subcategory-2"].sort());
});

test("asset create, delete or move also purges the nav counts", () => {
  const tags = assetTags({ id: 5, subCategoryIds: [2, 4], categoryIds: [1, 3], countChanged: true });
  assert.ok(tags.includes(TAG.nav));
  for (const t of ["subcategory-2", "subcategory-4", "category-1", "category-3"]) assert.ok(tags.includes(t), t);
});

test("category changes purge the broad listing tags but never general", () => {
  const tags = categoryTags({ categoryIds: [1, 3], subCategoryId: 7 });
  for (const t of ["categories", "sub-categories", "assets", "category-1", "category-3", "subcategory-7"]) {
    assert.ok(tags.includes(t), t);
  }
  assert.ok(!tags.includes(TAG.general));
});

test("no duplicates and no undefined ids", () => {
  const tags = assetTags({ id: 1, subCategoryIds: [2, 2], categoryIds: [1, 1], countChanged: true });
  assert.equal(new Set(tags).size, tags.length);
  assert.ok(!tags.some((t) => t.includes("undefined")));
});
