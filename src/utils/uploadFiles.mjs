import fs from "fs";
import path from "path";
import { prisma } from "../db/prisma.mjs";

// Every column that stores an uploads/ file name. Keep in sync with prisma/schema.prisma.
export const FILE_COLUMNS = {
  category: ["image"],
  subCategory: ["image"],
  asset: ["cover"],
  assetImage: ["image"],
  assetFile: ["main_file"],
  aboutUs: ["cover"],
  setting: ["site_logo", "site_favicon"],
  page: ["cover"],
  slider: ["logo", "image"],
  social: ["icon"],
  innovativeFurnitures: ["bgImg"],
  supportedBy: ["imageOne", "imageTwo", "imageThree", "imageFour", "imageFive"],
  blog: ["image", "bgImage"],
  gallery: ["image"],
};

const isReferenced = async (name) => {
  const counts = await Promise.all(
    Object.entries(FILE_COLUMNS).map(([model, cols]) =>
      prisma[model].count({ where: { OR: cols.map((c) => ({ [c]: name })) } }),
    ),
  );
  return counts.some((n) => n > 0);
};

// Deletes upload files no row in any table still uses. Call after the DB change succeeded; never throws.
export async function removeUploads(names) {
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const unique = [...new Set(names)].filter((n) => typeof n === "string" && n.trim());
  for (const name of unique) {
    try {
      const filePath = path.resolve(uploadsDir, name);
      if (!filePath.startsWith(uploadsDir + path.sep)) continue; // never outside uploads/
      if (await isReferenced(name)) continue;
      await fs.promises.unlink(filePath);
    } catch (e) {
      if (e.code !== "ENOENT") console.error(`Could not remove upload ${name}:`, e);
    }
  }
}

// File names in `before` that `after` no longer has; with no `after` (a delete) all of them
export const oldFiles = (model, before, after) =>
  FILE_COLUMNS[model].filter((c) => before?.[c] && before[c] !== after?.[c]).map((c) => before[c]);

// Every file of the assets matching `where`, for deletes that cascade to assets
export async function assetFiles(where) {
  const assets = await prisma.asset.findMany({
    where,
    select: { cover: true, file: { select: { main_file: true } }, images: { select: { image: true } } },
  });
  return assets.flatMap((a) => [a.cover, a.file?.main_file, ...a.images.map((i) => i.image)]);
}
