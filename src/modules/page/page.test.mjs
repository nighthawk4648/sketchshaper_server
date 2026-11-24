import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../db/prisma.mjs";
import pageService from "./page.service.mjs";

// Uses the local dev database: one throwaway page, removed at the end
const slug = `page-test-${Date.now()}`;

test("a page can be created without a cover, as the admin form sends it", async (t) => {
  let page;
  t.after(async () => {
    if (page) await prisma.page.delete({ where: { id: page.id } });
    await prisma.$disconnect();
  });

  page = await pageService.createPage({
    slug,
    title: "Page test",
    short_description: "Summary",
    content: "<p>Body</p>",
    meta_title: "",
    meta_description: "",
    keywords: "",
  });

  assert.equal(page.cover, "");
  assert.equal(page.slug, slug);
});
