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
