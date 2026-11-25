import { isIndexingEnabled } from "./googleIndexer.mjs";

// The key is public by design; the website serves it at /<key>.txt
export const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY || "c05b41422039775e6e6ef8f627dcbfaf";

const HOST = "www.sketchshaper.com";
const SITE = `https://${HOST}/`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const CHUNK_SIZE = 10000;

// Same as the website's src/utils/slugify.js
const slugify = (text = "unnamed") => {
  if (!text || typeof text !== "string") return "unnamed";
  return text
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .toLowerCase()
    .replace(/\//g, "-");
};

// Same as the website's blogPath in src/utils/paths.js
export const blogUrl = (blog) =>
  `${SITE}blog/${blog.slug || slugify(blog.title)}-${blog.id}`;

export async function submitIndexNow(urls, { fetchImpl = fetch } = {}) {
  const list = [
    ...new Set(
      (Array.isArray(urls) ? urls : [urls]).filter(
        (u) => typeof u === "string" && u.startsWith(SITE),
      ),
    ),
  ];
  const results = [];
  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `${SITE}${INDEXNOW_KEY}.txt`,
          urlList: list.slice(i, i + CHUNK_SIZE),
        }),
      });
      if (!res.ok) console.warn(`[IndexNow] HTTP ${res.status}`);
      results.push({ ok: !!res.ok, status: res.status });
    } catch (err) {
      console.warn("[IndexNow] Failed:", err.message);
      results.push({ ok: false });
    }
  }
  return results;
}

// Fire-and-forget; never delays or breaks the API response
export function notifyIndexNow(urls) {
  if (!isIndexingEnabled()) {
    console.log("[IndexNow] Skipped (not enabled)");
    return { skipped: true };
  }
  submitIndexNow(urls).catch((err) =>
    console.warn("[IndexNow] Background error:", err.message),
  );
  return { skipped: false };
}
