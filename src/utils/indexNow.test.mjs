import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { submitIndexNow, notifyIndexNow, blogUrl, INDEXNOW_KEY } from "./indexNow.mjs";

const S = "https://www.sketchshaper.com";
const recorder = (res = { ok: true, status: 200 }) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return res;
  };
  return { calls, fetchImpl };
};

describe("IndexNow", () => {
  it("posts the expected payload", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await submitIndexNow([`${S}/a`], { fetchImpl });
    assert.deepEqual(out, [{ ok: true, status: 200 }]);
    assert.equal(calls[0].url, "https://api.indexnow.org/indexnow");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["Content-Type"], "application/json; charset=utf-8");
    assert.deepEqual(calls[0].body, {
      host: "www.sketchshaper.com",
      key: INDEXNOW_KEY,
      keyLocation: `${S}/${INDEXNOW_KEY}.txt`,
      urlList: [`${S}/a`],
    });
  });

  it("drops foreign and relative URLs and dedupes", async () => {
    const { calls, fetchImpl } = recorder();
    await submitIndexNow(
      [`${S}/a`, `${S}/a`, "/b", "https://evil.com/c", "http://www.sketchshaper.com/d", null, `${S}/e`],
      { fetchImpl },
    );
    assert.deepEqual(calls[0].body.urlList, [`${S}/a`, `${S}/e`]);
  });

  it("sends nothing when no URL is valid", async () => {
    const { calls, fetchImpl } = recorder();
    assert.deepEqual(await submitIndexNow(["/x", null], { fetchImpl }), []);
    assert.equal(calls.length, 0);
  });

  it("chunks at 10000", async () => {
    const { calls, fetchImpl } = recorder();
    const urls = Array.from({ length: 10001 }, (_, i) => `${S}/p${i}`);
    const out = await submitIndexNow(urls, { fetchImpl });
    assert.equal(out.length, 2);
    assert.deepEqual(calls.map((c) => c.body.urlList.length), [10000, 1]);
  });

  it("returns ok:false on throw or non-2xx, never throws", async () => {
    const boom = async () => {
      throw new Error("network down");
    };
    assert.deepEqual(await submitIndexNow([`${S}/a`], { fetchImpl: boom }), [{ ok: false }]);
    const { fetchImpl } = recorder({ ok: false, status: 422 });
    assert.deepEqual(await submitIndexNow([`${S}/a`], { fetchImpl }), [{ ok: false, status: 422 }]);
  });

  it("blogUrl follows the website blogPath rule", () => {
    assert.equal(blogUrl({ id: 5, slug: "my-post", title: "X" }), `${S}/blog/my-post-5`);
    assert.equal(blogUrl({ id: 5, slug: null, title: "Hello World / Tips!" }), `${S}/blog/hello-world-tips-5`);
    assert.equal(blogUrl({ id: 5, slug: "", title: "" }), `${S}/blog/unnamed-5`);
  });

  it("notifyIndexNow skips when indexing is not enabled", () => {
    const saved = { m: process.env.MODE, e: process.env.ENABLE_GOOGLE_INDEXING };
    process.env.MODE = "dev";
    delete process.env.ENABLE_GOOGLE_INDEXING;
    try {
      assert.deepEqual(notifyIndexNow([`${S}/a`]), { skipped: true });
    } finally {
      if (saved.m === undefined) delete process.env.MODE; else process.env.MODE = saved.m;
      if (saved.e !== undefined) process.env.ENABLE_GOOGLE_INDEXING = saved.e;
    }
  });
});
