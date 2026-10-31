import multer from 'multer';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Sanitizes original filename into a clean, SEO-friendly, URL-safe slug.
 * Preserves search keywords while preventing collisions and path traversal.
 * Example: "Modern Leather Sofa (2026) #1.PNG" -> "modern-leather-sofa-2026-1-1730398822000.png"
 */
export function sanitizeFileName(originalName, fallbackFieldname = 'image') {
  if (!originalName || typeof originalName !== 'string') {
    return `${fallbackFieldname}-${Date.now()}`;
  }

  const parsed = path.parse(originalName);
  const ext = (parsed.ext || '').toLowerCase();

  // 1. Strip accents, convert to lowercase, replace special chars & spaces with single hyphen
  let cleanName = parsed.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  // 2. Safe fallback if original filename consisted only of symbols (e.g. "###.png")
  if (!cleanName) {
    cleanName = fallbackFieldname;
  }

  // 3. Limit length to 80 chars to stay safely below MySQL VARCHAR and filesystem limits
  cleanName = cleanName.slice(0, 80).replace(/-+$/, '');

  return `${cleanName}-${Date.now()}${ext}`;
}

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../uploads/'),
  filename: (req, file, cb) => {
    cb(null, sanitizeFileName(file.originalname, file.fieldname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  }
});

export default upload;