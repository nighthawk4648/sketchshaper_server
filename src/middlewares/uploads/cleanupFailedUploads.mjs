import { removeUploads } from "../../utils/uploadFiles.mjs";

// Multer saves files before the handler runs; a failed request would otherwise leave them on disk.
// removeUploads keeps any file a half-finished create already points to.
export const cleanupFailedUploads = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 400 && Array.isArray(req.files)) removeUploads(req.files.map((f) => f.filename));
  });
  next();
};
