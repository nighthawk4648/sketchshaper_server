import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import express from "express";
import { prisma } from "../../db/prisma.mjs";
import assetRouter from "../../routes/api/asset.route.mjs";
import globalErrorHandler from "../../middlewares/errors/globalErrorHandler.mjs";
import { createSession, SITE_COOKIE } from "../../utils/session.mjs";

// Uses the local dev database and uploads folder: throwaway rows and files, removed at the end
const stamp = Date.now();
const dir = path.join(process.cwd(), "uploads", "sketchshaper-pro");
fs.mkdirSync(dir, { recursive: true });
const content = Buffer.from("0123456789abcdefghij"); // 20 bytes
const fileOf = (name) => {
  fs.writeFileSync(path.join(dir, name), content);
  return `sketchshaper-pro/${name}`;
};

const category = await prisma.category.create({ data: { name: `dl-test-${stamp}`, short_description: "t" } });
const sub = await prisma.subCategory.create({ data: { name: `dl-test-${stamp}`, short_description: "t", category_id: category.id } });
const makeAsset = (name, access_type, main_file) =>
  prisma.asset.create({
    data: {
      name, cover: "x.jpg", resolution: "x", size: "x", sub_category_id: sub.id, access_type,
      file: { create: { main_file, file_type: ".skp", file_size: content.length, upload_status: "completed" } },
    },
  });
const free = await makeAsset("free", "free", fileOf(`dl-${stamp}-ঘরের খাট.skp`));
const pro = await makeAsset("pro", "paid", fileOf(`dl-${stamp}-pro.skp`));
const odd = await makeAsset("odd", "Paid", fileOf(`dl-${stamp}-odd.skp`)); // a value nobody should save
const vanished = await makeAsset("gone", "free", `sketchshaper-pro/dl-${stamp}-missing.skp`);

const member = await prisma.siteUser.create({ data: { email: `dl-test-${stamp}@example.test`, access: "pro" } });
const { token } = await createSession({ kind: "website", siteUserId: member.id, ttlMs: 60_000 }, { ip: "1.1.1.1", get: () => "t" });
const proCookie = `${SITE_COOKIE}=${token}`;

const app = express();
app.use(express.json());
app.use("/api/assets", assetRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/assets`;
console.error = () => {};

test.after(async () => {
  server.close();
  for (const f of fs.readdirSync(dir).filter((n) => n.startsWith(`dl-${stamp}-`))) fs.unlinkSync(path.join(dir, f));
  await prisma.category.delete({ where: { id: category.id } }); // cascades to sub-category, assets, files
  await prisma.siteUser.delete({ where: { id: member.id } });
  await prisma.$disconnect();
});

const download = (id, headers = {}, signal) => fetch(`${base}/${id}/download`, { headers, signal });

test("free models download for anyone; a file name in any language arrives intact", async () => {
  const res = await download(free.id);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), content.toString());
  const disposition = res.headers.get("content-disposition");
  assert.match(disposition, /^attachment;/);
  assert.match(disposition, /filename\*=UTF-8''/);
  assert.ok(decodeURIComponent(disposition.split("UTF-8''")[1]).endsWith("ঘরের খাট.skp"));
});

test("PRO models need a PRO account, and a value that is not plainly 'free' is locked too", async () => {
  assert.equal((await download(pro.id)).status, 401);
  assert.equal((await download(odd.id)).status, 401, "unknown access value must not mean free");
  const ok = await download(pro.id, { Cookie: proCookie });
  assert.equal(ok.status, 200);
  assert.equal((await ok.arrayBuffer()).byteLength, content.length);
});

test("resume: a byte range returns just that part; one past the end gets 416; a malformed one gets the whole file", async () => {
  const part = await download(free.id, { Range: "bytes=10-14" });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 10-14/20");
  assert.equal(Buffer.from(await part.arrayBuffer()).toString(), "abcde");

  const tail = await download(free.id, { Range: "bytes=15-" });
  assert.equal(Buffer.from(await tail.arrayBuffer()).toString(), "fghij");

  const past = await download(free.id, { Range: "bytes=500-600" });
  assert.equal(past.status, 416);
  assert.equal(past.headers.get("content-range"), "bytes */20");

  const junk = await download(free.id, { Range: "bytes=abc-" });
  assert.equal(junk.status, 200);
  assert.equal((await junk.arrayBuffer()).byteLength, 20);
});

test("a missing file, a model with no upload, or an unknown model is a clear 404, and the server keeps working", async () => {
  assert.equal((await download(vanished.id)).status, 404);
  const noUpload = await prisma.asset.create({
    data: { name: "no file", cover: "x.jpg", resolution: "x", size: "x", sub_category_id: sub.id, access_type: "free" },
  });
  assert.equal((await download(noUpload.id)).status, 404);
  assert.equal((await download(999999999)).status, 404);
  assert.equal((await download(free.id)).status, 200);
});

test("a cancelled download closes its file on the server (no leaked file handles)", async () => {
  const name = `dl-${stamp}-big.skp`;
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(32 * 1024 * 1024, 7)); // big enough to still be sending
  const big = await makeAsset("big", "free", `sketchshaper-pro/${name}`);
  const openHandles = () =>
    fs.readdirSync("/proc/self/fd").filter((fd) => {
      try {
        return fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith(name);
      } catch {
        return false;
      }
    }).length;
  for (let i = 0; i < 3; i++) {
    const ac = new AbortController();
    const res = await download(big.id, {}, ac.signal);
    await res.body.getReader().read();
    ac.abort();
  }
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(openHandles(), 0);
});

test("saving a model with an unknown access type is refused", async () => {
  const form = (fields) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };
  const create = await fetch(base, { method: "POST", body: form({ name: "x", sub_category_id: String(sub.id), access_type: "pro" }) });
  assert.equal(create.status, 400);
  assert.match((await create.json()).message, /free or paid/);

  const edit = await fetch(`${base}/${pro.id}`, { method: "PUT", body: form({ access_type: "Paid" }) });
  assert.equal(edit.status, 400);
  assert.equal((await prisma.asset.findUnique({ where: { id: pro.id } })).access_type, "paid", "unchanged");
});

test("the extension's slim library has the same values as the full list, without the heavy parts", async () => {
  const slim = (await (await fetch(`${base}/library`)).json()).data;
  const full = (await (await fetch(`${base}/pages?limit=5000&sub_category_id=${sub.id}`)).json()).data.result;
  const keys = ["id", "name", "cover", "cover_alt", "size", "keywords", "access_type", "sub_category_id"];
  for (const a of full) {
    const s = slim.find((x) => x.id === a.id);
    for (const k of keys) assert.deepEqual(s[k], a[k], k);
    // the download folder name comes from file.updated_at, so it must match exactly
    assert.deepEqual(s.file, a.file && { file_size: a.file.file_size, updated_at: a.file.updated_at });
    assert.equal(s.images, undefined);
    assert.equal(s.sub_category, undefined);
  }
  assert.ok(slim.every((x, i) => i === 0 || slim[i - 1].id > x.id), "newest first");
});

const countOf = async (id) => (await prisma.asset.findUnique({ where: { id } })).download_count;

test("a download adds one to the count; resumed pieces, HEAD checks and refused requests add nothing", async () => {
  const model = await makeAsset("counted", "paid", fileOf(`dl-${stamp}-counted.skp`));
  const before = await prisma.asset.findUnique({ where: { id: model.id } });
  assert.equal(before.download_count, 0);

  await (await download(model.id, { Cookie: proCookie })).arrayBuffer();
  assert.equal(await countOf(model.id), 1);

  await (await download(model.id, { Cookie: proCookie, Range: "bytes=0-9" })).arrayBuffer();
  assert.equal(await countOf(model.id), 2, "the first piece of a resumed download is the download");

  await (await download(model.id, { Cookie: proCookie, Range: "bytes=10-" })).arrayBuffer();
  await fetch(`${base}/${model.id}/download`, { method: "HEAD", headers: { Cookie: proCookie } });
  await download(model.id); // PRO model, no account: refused
  await download(model.id, { Cookie: proCookie, Range: "bytes=500-600" }); // 416
  assert.equal(await countOf(model.id), 2);

  const after = await prisma.asset.findUnique({ where: { id: model.id } });
  assert.deepEqual(after.updated_at, before.updated_at, "counting a download is not an edit");
});

test("sorting by downloads covers the whole list, and equal counts keep a stable order across pages", async () => {
  await prisma.asset.update({ where: { id: free.id }, data: { download_count: 7 } });
  await prisma.asset.updateMany({ where: { id: { in: [pro.id, odd.id, vanished.id] } }, data: { download_count: 3 } });
  const get = async (order, query) =>
    (await (await fetch(`${base}/pages?sub_category_id=${sub.id}&sort_by=download_count&order=${order}&${query}`)).json()).data.result;

  const all = await get("desc", "limit=5000");
  assert.equal(all[0].id, free.id);
  assert.ok(all.every((a, i) => i === 0 || a.download_count < all[i - 1].download_count || (a.download_count === all[i - 1].download_count && a.id < all[i - 1].id)));

  const paged = [];
  for (let p = 1; p <= Math.ceil(all.length / 2); p++) paged.push(...(await get("desc", `limit=2&page=${p}`)));
  assert.deepEqual(paged.map((a) => a.id), all.map((a) => a.id));

  const asc = await get("asc", "limit=5000");
  assert.ok(asc.every((a, i) => i === 0 || a.download_count >= asc[i - 1].download_count));
  assert.equal(asc.at(-1).id, free.id);
});

// ---- image updates: what the admin's Save sends for a replaced cover or gallery photo ----
const uploadsRoot = path.join(process.cwd(), "uploads");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAZ1Wl3QAAAABJRU5ErkJggg==", "base64");
const stage = (name) => {
  fs.writeFileSync(path.join(uploadsRoot, name), png);
  return name;
};
const onDisk = (name) => fs.existsSync(path.join(uploadsRoot, name));
const rawAsset = (name, cover, images = []) =>
  prisma.asset.create({
    data: { name, cover, resolution: "x", size: "x", sub_category_id: sub.id, images: { create: images } },
    include: { images: true },
  });
const save = (id, fields, files = []) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const [field, name] of files) form.append(field, new Blob([png], { type: "image/png" }), name);
  return fetch(`${base}/${id}`, { method: "PUT", body: form });
};
test.after(() => {
  for (const f of fs.readdirSync(uploadsRoot).filter((n) => n.startsWith(`cv-${stamp}-`))) fs.unlinkSync(path.join(uploadsRoot, f));
});

test("replacing the cover deletes the old file; no new cover, or a file another asset still uses, deletes nothing", async () => {
  const oldCover = stage(`cv-${stamp}-old.png`);
  const shared = stage(`cv-${stamp}-shared.png`);
  const a = await rawAsset("cover a", oldCover);
  const b = await rawAsset("cover b", shared);
  await rawAsset("cover c", shared);

  assert.equal((await save(a.id, { name: "cover a" })).status, 200);
  assert.ok(onDisk(oldCover), "no new cover sent: old file stays");

  assert.equal((await save(a.id, { name: "cover a" }, [["cover", `cv-${stamp}-new.png`]])).status, 200);
  const { cover } = await prisma.asset.findUnique({ where: { id: a.id } });
  assert.notEqual(cover, oldCover);
  assert.ok(onDisk(cover), "new cover is saved");
  assert.equal(onDisk(oldCover), false, "old cover is gone");

  assert.equal((await save(b.id, { name: "cover b" }, [["cover", `cv-${stamp}-new2.png`]])).status, 200);
  assert.ok(onDisk(shared), "another asset still uses this file");
});

test("a replaced gallery photo (new file + old one on the removal list) leaves one image; X alone removes it for good", async () => {
  const keep = stage(`cv-${stamp}-keep.png`);
  const drop = stage(`cv-${stamp}-drop.png`);
  const g = await rawAsset("gallery", "x.jpg", [{ image: keep, alt: "keep alt" }, { image: drop, alt: "drop alt" }]);
  const rowOf = (img) => g.images.find((i) => i.image === img);
  const rows = () => prisma.assetImage.findMany({ where: { asset_id: g.id }, orderBy: { id: "asc" } });

  // X on one image
  const x = await save(g.id, {
    name: "gallery",
    newImageAlts: "[]",
    existingImageAlts: JSON.stringify([{ id: rowOf(keep).id, alt: "keep alt" }]),
    "removedImageIds[0]": String(rowOf(drop).id),
  });
  assert.equal(x.status, 200);
  assert.deepEqual((await rows()).map((r) => r.image), [keep]);
  assert.equal(onDisk(drop), false, "removed image's file is deleted");

  // Change Photo on the other: new file, and the old image on the removal list
  const swap = await save(
    g.id,
    {
      name: "gallery",
      newImageAlts: JSON.stringify([{ tempId: "t1", alt: "keep alt" }]),
      existingImageAlts: "[]",
      "removedImageIds[0]": String(rowOf(keep).id),
    },
    [["image_t1", `cv-${stamp}-fresh.png`]],
  );
  assert.equal(swap.status, 200);
  const after = await rows();
  assert.equal(after.length, 1, "one image, not two");
  assert.notEqual(after[0].image, keep);
  assert.equal(after[0].alt, "keep alt");
  assert.equal(onDisk(keep), false);
  assert.ok(onDisk(after[0].image));
});
