import { verifyAdminAuth } from "./verifyAdminAuth.mjs";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Anyone may read public data; only a signed-in admin may create, change or delete it.
export const requireAdminForWrites = (req, res, next) =>
  READ_ONLY_METHODS.has(req.method) ? next() : verifyAdminAuth(req, res, next);
