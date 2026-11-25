import path from "path";
import express from "express";

// Model files (free and PRO) and half-finished upload pieces. They only go out through
// GET /api/assets/:id/download, which checks PRO access.
const PRIVATE = /^\/(sketchshaper-pro|temp)(\/|$)/i;

// Same decoding and normalising express.static does, so tricks like %2D or ../ cannot slip past
export function isPrivateUpload(urlPath) {
  try {
    return PRIVATE.test(path.posix.normalize(decodeURIComponent(urlPath)));
  } catch {
    return true; // undecodable: refuse rather than guess
  }
}

const refusePrivate = (req, res, next) => (isPrivateUpload(req.path) ? res.sendStatus(404) : next());

// Images stay public; everything else in uploads is served as before
export const publicUploads = [refusePrivate, express.static("uploads")];

export const NO_STORE = "no-store, no-cache, must-revalidate, proxy-revalidate";
export const LONG_CACHE = "public, max-age=31536000, immutable";
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const MOUNT = "/api/uploads";

// Long cache only for public image files under the uploads mount; everything else stays no-store
export function cacheControlFor(urlPath) {
  try {
    const clean = path.posix.normalize(decodeURIComponent(urlPath));
    if (!clean.startsWith(`${MOUNT}/`)) return NO_STORE;
    const rest = clean.slice(MOUNT.length);
    return IMAGE_EXT.test(rest) && !isPrivateUpload(rest) ? LONG_CACHE : NO_STORE;
  } catch {
    return NO_STORE;
  }
}
