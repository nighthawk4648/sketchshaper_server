import { config } from "../config/config.mjs";

const SITES = [
  config.frontend_url,
  "https://admin.sketchshaper.com",
  "https://sketchshaper.com",
  "https://www.sketchshaper.com",
  "http://localhost:5173", // For local development
  "http://localhost:3000", // For local development
].filter(Boolean);

export function corsOptionsFor(origin, mode = config.mode) {
  // The SketchUp extension's window is a local file, so its Origin is "null". Other sandboxed pages
  // send "null" too, so it may read public data only: never with cookies.
  if (origin === "null") return { origin: true, credentials: false };
  if (!origin || mode === "dev" || SITES.includes(origin)) return { origin: true, credentials: true };
  // Unknown sites must not read responses made with our session cookies
  console.warn(`CORS rejected origin: ${origin}`);
  return { origin: false };
}

export const corsPolicy = (req, callback) => callback(null, corsOptionsFor(req.get("origin")));
