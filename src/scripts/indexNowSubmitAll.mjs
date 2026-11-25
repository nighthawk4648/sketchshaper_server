// Submits every URL in the live sitemap to IndexNow (Bing, Yandex, Seznam, Naver).
// Usage: node src/scripts/indexNowSubmitAll.mjs   (run once on the server after deploy)
import { submitIndexNow } from "../utils/indexNow.mjs";

const res = await fetch("https://www.sketchshaper.com/sitemap.xml");
if (!res.ok) {
  console.error(`Could not fetch sitemap: HTTP ${res.status}`);
  process.exit(1);
}
const xml = await res.text();
const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);

const results = await submitIndexNow(urls);
console.log(`Sent ${urls.length} URLs in ${results.length} request(s).`);
console.log("Statuses:", results.map((r) => (r.ok ? r.status : `failed(${r.status ?? "error"})`)).join(", "));
