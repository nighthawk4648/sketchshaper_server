import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prisma } from "../../db/prisma.mjs";
import categoryService from "./category.service.mjs";

// Uses the local dev database and uploads/ folder: throwaway rows and files, removed at the end
const uploads = path.resolve("uploads");
const stamp = Date.now();
const names = ["cat.png", "sub.png", "cover.png", "gallery.png"].map((n) => `test-upload-${stamp}-${n}`);
const modelFile = `sketchshaper-pro/test-upload-${stamp}-model.skp`;
const all = [...names, modelFile];

test("deleting a category removes the files of everything under it", async (t) => {
  let categoryId;
  t.after(async () => {
    // Guarded: a where with id undefined would match every category
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    for (const n of all) fs.rmSync(path.join(uploads, n), { force: true });
    await prisma.$disconnect();
  });
  fs.mkdirSync(path.join(uploads, "sketchshaper-pro"), { recursive: true });
  for (const n of all) fs.writeFileSync(path.join(uploads, n), "x");

  const [catImg, subImg, cover, galleryImg] = names;
  const category = await prisma.category.create({
    data: { name: "Delete test", short_description: "x", image: catImg },
  });
  categoryId = category.id;
  const sub = await prisma.subCategory.create({
    data: { name: "Delete test sub", short_description: "x", category_id: category.id, image: subImg },
  });
  const asset = await prisma.asset.create({
    data: { name: "Delete test asset", cover, resolution: "", size: "", sub_category_id: sub.id },
  });
  await prisma.assetImage.create({ data: { image: galleryImg, asset_id: asset.id } });
  await prisma.assetFile.create({ data: { asset_id: asset.id, main_file: modelFile } });

  await categoryService.deleteCategory(category.id);

  assert.equal(await prisma.asset.count({ where: { id: asset.id } }), 0);
  for (const n of all) assert.equal(fs.existsSync(path.join(uploads, n)), false, `${n} should be gone`);
});
