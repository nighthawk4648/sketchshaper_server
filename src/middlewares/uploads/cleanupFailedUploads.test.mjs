import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import express from "express";
import { prisma } from "../../db/prisma.mjs";
import { cleanupFailedUploads } from "./cleanupFailedUploads.mjs";

// Uses the local dev database and uploads/ folder: throwaway rows and files, removed at the end
const uploads = path.resolve("uploads");
const stamp = Date.now();
const make = (name) => {
  fs.writeFileSync(path.join(uploads, name), "x");
  return name;
};
const exists = (name) => fs.existsSync(path.join(uploads, name));
const settle = () => new Promise((resolve) => setTimeout(resolve, 500)); // cleanup runs after the response

const app = express();
app.use(cleanupFailedUploads);
// Stands in for multer: the file is already on disk when the handler answers
app.post("/:status", (req, res) => {
  req.files = [{ filename: req.query.file }];
  res.status(Number(req.params.status)).end();
});
const server = app.listen(0);
const send = (status, file) =>
  fetch(`http://127.0.0.1:${server.address().port}/${status}?file=${file}`, { method: "POST" });

test.after(async () => {
  server.close();
  await prisma.$disconnect();
});

test("a failed request removes the files it uploaded", async () => {
  const name = make(`test-upload-${stamp}-400.png`);
  await send(400, name);
  await settle();
  assert.equal(exists(name), false);
});

test("a successful request keeps its files", async (t) => {
  const name = make(`test-upload-${stamp}-200.png`);
  t.after(() => fs.rmSync(path.join(uploads, name), { force: true }));
  await send(200, name);
  await settle();
  assert.equal(exists(name), true);
});

test("a failed request keeps a file a half-finished create already points to", async (t) => {
  const name = make(`test-upload-${stamp}-500.png`);
  const row = await prisma.gallery.create({ data: { image: name } });
  t.after(async () => {
    await prisma.gallery.delete({ where: { id: row.id } });
    fs.rmSync(path.join(uploads, name), { force: true });
  });
  await send(500, name);
  await settle();
  assert.equal(exists(name), true);
});
