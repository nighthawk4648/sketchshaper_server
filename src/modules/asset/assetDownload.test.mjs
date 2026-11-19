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
    assert.deepEqual(s.file, { file_size: a.file.file_size, updated_at: a.file.updated_at });
    assert.equal(s.images, undefined);
    assert.equal(s.sub_category, undefined);
  }
  assert.ok(slim.every((x, i) => i === 0 || slim[i - 1].id > x.id), "newest first");
});
