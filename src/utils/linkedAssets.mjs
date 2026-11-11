import { prisma } from "../db/prisma.mjs";

/** Fields a linked-asset card needs. Never includes main_file or gallery images. */
export const LINKED_ASSET_SELECT = {
  id: true,
  name: true,
  slug: true,
  cover: true,
  cover_alt: true,
  access_type: true,
  sub_category: {
    select: {
      id: true,
      name: true,
      slug: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  },
};

export const MAX_LINKED_ASSETS = 25;

/**
 * Parses and cleans a list of asset IDs coming from a request body.
 *
 * Returns:
 *   undefined → leave links unchanged (field absent, empty, or malformed)
 *   number[]  → the new full list (may be [] to clear all links)
 */
export function parseLinkedIds(rawInput, selfId = null) {
  if (rawInput === undefined || rawInput === null || rawInput === "") {
    return undefined;
  }

  let parsed;
  if (typeof rawInput === "string") {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      return undefined; // malformed → never treat as "clear"
    }
  } else {
    parsed = rawInput;
  }
  if (!Array.isArray(parsed)) return undefined;

  const clean = [];
  for (const val of parsed) {
    const n = parseInt(val);
    if (!isNaN(n) && n > 0 && n !== selfId && !clean.includes(n)) {
      clean.push(n);
    }
  }
  return clean.slice(0, MAX_LINKED_ASSETS);
}

/** Keeps only IDs of assets that exist, preserving the given order. */
export async function filterExistingAssetIds(ids) {
  if (!ids.length) return [];
  const rows = await prisma.asset.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existing = new Set(rows.map((r) => r.id));
  return ids.filter((n) => existing.has(n));
}

/** Cache tags of every model and blog that embeds any of the given assets. */
export async function getLinkedParentTags(assetIds) {
  const ids = (Array.isArray(assetIds) ? assetIds : [assetIds])
    .map((n) => parseInt(n))
    .filter((n) => !isNaN(n));
  if (!ids.length) return [];

  const [parentRels, blogRels] = await Promise.all([
    prisma.assetRelation.findMany({
      where: { child_asset_id: { in: ids } },
      select: { parent_asset_id: true },
    }),
    prisma.blogAsset.findMany({
      where: { asset_id: { in: ids } },
      select: { blog_id: true },
    }),
  ]);

  return [
    ...parentRels.map((r) => `asset-${r.parent_asset_id}`),
    ...blogRels.map((r) => `blog-${r.blog_id}`),
  ];
}
