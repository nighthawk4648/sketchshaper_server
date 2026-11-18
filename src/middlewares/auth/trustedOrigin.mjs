import { config } from "../../config/config.mjs";

const SITE_ORIGINS = ["https://www.sketchshaper.com", "https://sketchshaper.com"];

// Browsers send Origin on writes; refusing other sites stops them acting with a visitor's cookie
export const isTrustedSiteOrigin = (origin, mode = config.mode, frontendUrl = config.frontend_url) =>
  !origin || mode === "dev" || SITE_ORIGINS.includes(origin) || origin === frontendUrl?.replace(/\/+$/, "");

export const requireTrustedOrigin = (req, res, next) =>
  isTrustedSiteOrigin(req.get("origin"))
    ? next()
    : res.status(403).json({ status: "error", code: 403, message: "Request origin not allowed." });
