import multer from "multer";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Anchored to backend repository root
const BACKEND_ROOT = path.resolve(__dirname, "../../../");
export const PRIVATE_CONTACT_DIR = path.join(BACKEND_ROOT, "private_uploads/contact");

// Automatically ensure private directory exists on boot
if (!fs.existsSync(PRIVATE_CONTACT_DIR)) {
  fs.mkdirSync(PRIVATE_CONTACT_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".pdf", "application/pdf"],
]);

/**
 * Verify file magic bytes against extension
 */
export function verifyMagicBytes(filePath, ext) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(12);
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // JPEG: FF D8 FF
    if (ext === ".jpg" || ext === ".jpeg") {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    // PNG: 89 50 4E 47
    if (ext === ".png") {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }
    // PDF: %PDF
    if (ext === ".pdf") {
      return buffer.subarray(0, 4).toString("latin1") === "%PDF";
    }
    // WebP: RIFF....WEBP
    if (ext === ".webp") {
      return (
        buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
        buffer.subarray(8, 12).toString("latin1") === "WEBP"
      );
    }
    // AVIF: ....ftypavif / ....ftypavis (rejects other ISO-BMFF files like MP4/HEIC)
    if (ext === ".avif") {
      const box = buffer.subarray(4, 8).toString("latin1");
      const brand = buffer.subarray(8, 12).toString("latin1");
      return box === "ftyp" && (brand === "avif" || brand === "avis");
    }
    return false;
  } catch (err) {
    return false;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PRIVATE_CONTACT_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = `${crypto.randomUUID()}${ext}`;
    cb(null, randomName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = ALLOWED_MIME_TYPES.get(ext);

  if (!expectedMime || file.mimetype !== expectedMime) {
    const err = new Error(
      "Invalid file type. Only JPG, PNG, WebP, AVIF, and PDF files are allowed.",
    );
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});

/**
 * Express middleware wrapper for handling contact file uploads
 */
export const handleContactUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  // Non-multipart requests (like JSON from homepage SupportDesk) pass through cleanly
  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  upload.single("attachment")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            status: "error",
            code: 413,
            message: "Attached file is too large. Maximum allowed size is 50 MB.",
          });
        }
        return res.status(400).json({
          status: "error",
          code: 400,
          message:
            err.code === "LIMIT_UNEXPECTED_FILE"
              ? "Unexpected file field. Attach your file as 'attachment'."
              : err.message || "Error processing uploaded file.",
        });
      }
      return res.status(400).json({
        status: "error",
        code: 400,
        message: err.message || "File upload error.",
      });
    }

    // Post-upload magic bytes verification
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!verifyMagicBytes(req.file.path, ext)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
        return res.status(400).json({
          status: "error",
          code: 400,
          message: "Corrupted or spoofed file detected. Please upload a genuine image or PDF.",
        });
      }
    }

    next();
  });
};
