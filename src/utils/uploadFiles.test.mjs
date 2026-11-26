import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "../db/prisma.mjs";
import { removeUploads, oldFiles } from "./uploadFiles.mjs";
import chunkUploadHelper from "./chunkUploadHelper.mjs";

// Uses the local dev database and uploads/ folder: throwaway rows and files, removed at the end
const uploads = path.resolve("uploads");
const stamp = Date.now();
const make = (name) => {
  fs.writeFileSync(path.join(uploads, name), "x");
  return name;
};
const exists = (name) => fs.existsSync(path.join(uploads, name));

test.after(() => prisma.$disconnect());

test("an upload nothing uses is deleted", async () => {
  const name = make(`test-upload-${stamp}-free.png`);
  await removeUploads([name, name, "", null, undefined]);
  assert.equal(exists(name), false);
});

test("an upload a row still uses is kept", async (t) => {
  const name = make(`test-upload-${stamp}-used.png`);
  const row = await prisma.gallery.create({ data: { image: name } });
  t.after(async () => {
    await prisma.gallery.delete({ where: { id: row.id } });
    fs.rmSync(path.join(uploads, name), { force: true });
  });
  await removeUploads([name]);
  assert.equal(exists(name), true);
});

test("a name pointing outside uploads/ is refused", async (t) => {
  const outside = path.join(os.tmpdir(), `test-outside-${stamp}.txt`);
  fs.writeFileSync(outside, "x");
  t.after(() => fs.rmSync(outside, { force: true }));
  await removeUploads([path.relative(uploads, outside)]);
  assert.equal(fs.existsSync(outside), true);
});

test("a missing file is not an error", async () => {
  await removeUploads([`test-upload-${stamp}-missing.png`]);
});

test("oldFiles lists only the file columns that changed", () => {
  const before = { logo: "a.png", image: "b.png", name: "x" };
  assert.deepEqual(oldFiles("slider", before, { logo: "a.png", image: "c.png" }), ["b.png"]);
  assert.deepEqual(oldFiles("slider", before, before), []);
  assert.deepEqual(oldFiles("slider", before), ["a.png", "b.png"]);
  assert.deepEqual(oldFiles("slider", null), []);
});

test("upload sessions untouched for a day are removed, fresh ones kept", async (t) => {
  const realTemp = chunkUploadHelper.tempDir;
  chunkUploadHelper.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-chunks-"));
  t.after(() => {
    fs.rmSync(chunkUploadHelper.tempDir, { recursive: true, force: true });
    chunkUploadHelper.tempDir = realTemp;
  });
  const stale = path.join(chunkUploadHelper.tempDir, "stale");
  const fresh = path.join(chunkUploadHelper.tempDir, "fresh");
  fs.mkdirSync(stale);
  fs.mkdirSync(fresh);
  fs.writeFileSync(path.join(stale, "chunk_0"), "x");
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  fs.utimesSync(stale, twoDaysAgo, twoDaysAgo);

  await chunkUploadHelper.removeStaleSessions();
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(fresh), true);
});
