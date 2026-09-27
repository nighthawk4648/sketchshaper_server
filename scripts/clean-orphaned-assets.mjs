import fs from "fs";
import path from "path";

/**
 * Normalizes a database path or file path:
 * - Strips leading slashes
 * - Strips redundant 'uploads/' or 'api/uploads/' prefixes
 * Returns a standardized relative path (e.g., 'cover.jpg' or 'sketchshaper-pro/model.skp')
 */
export const normalizeFilePath = (rawPath) => {
  if (!rawPath || typeof rawPath !== "string") return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  return trimmed
    .replace(/^\/?(api\/uploads\/|uploads\/)+/i, "")
    .replace(/^\/+/, "");
};

/**
 * Collects all active file paths from the database across all content models.
 */
export const fetchActiveDbFiles = async (prismaClient) => {
  const activePaths = new Set();
  const activeBasenames = new Set();

  const addPath = (val) => {
    const normalized = normalizeFilePath(val);
    if (normalized) {
      activePaths.add(normalized);
      activeBasenames.add(path.basename(normalized));
    }
  };

  try {
    // 1. Asset & AssetFile & AssetImage
    const [assets, assetImages, assetFiles] = await Promise.all([
      prismaClient.asset.findMany({ select: { cover: true } }),
      prismaClient.assetImage.findMany({ select: { image: true } }),
      prismaClient.assetFile.findMany({ select: { main_file: true } }),
    ]);
    assets.forEach((a) => addPath(a.cover));
    assetImages.forEach((ai) => addPath(ai.image));
    assetFiles.forEach((af) => addPath(af.main_file));

    // 2. Categories & SubCategories
    const [categories, subCategories] = await Promise.all([
      prismaClient.category.findMany({ select: { image: true } }),
      prismaClient.subCategory.findMany({ select: { image: true } }),
    ]);
    categories.forEach((c) => addPath(c.image));
    subCategories.forEach((sc) => addPath(sc.image));

    // 3. Blogs & Gallery
    const [blogs, galleries] = await Promise.all([
      prismaClient.blog.findMany({ select: { image: true, bgImage: true } }),
      prismaClient.gallery.findMany({ select: { image: true } }),
    ]);
    blogs.forEach((b) => {
      addPath(b.image);
      addPath(b.bgImage);
    });
    galleries.forEach((g) => addPath(g.image));

    // 4. Sliders, Innovative Furnitures & SupportedBy
    const [sliders, furnitures, supportedBy] = await Promise.all([
      prismaClient.slider.findMany({ select: { image: true, logo: true } }),
      prismaClient.innovativeFurnitures.findMany({ select: { bgImg: true } }),
      prismaClient.supportedBy.findMany({
        select: {
          imageOne: true,
          imageTwo: true,
          imageThree: true,
          imageFour: true,
          imageFive: true,
        },
      }),
    ]);
    sliders.forEach((s) => {
      addPath(s.image);
      addPath(s.logo);
    });
    furnitures.forEach((f) => addPath(f.bgImg));
    supportedBy.forEach((sb) => {
      addPath(sb.imageOne);
      addPath(sb.imageTwo);
      addPath(sb.imageThree);
      addPath(sb.imageFour);
      addPath(sb.imageFive);
    });

    // 5. Pages, AboutUs & Settings
    const [pages, aboutUs, settings] = await Promise.all([
      prismaClient.page.findMany({ select: { cover: true } }),
      prismaClient.aboutUs.findMany({ select: { cover: true } }),
      prismaClient.setting.findMany({
        select: { site_logo: true, site_favicon: true },
      }),
    ]);
    pages.forEach((p) => addPath(p.cover));
    aboutUs.forEach((au) => addPath(au.cover));
    settings.forEach((s) => {
      addPath(s.site_logo);
      addPath(s.site_favicon);
    });
  } catch (error) {
    console.error("Error fetching active files from database:", error);
    throw error;
  }

  return { activePaths, activeBasenames };
};

/**
 * Recursively scans a directory and returns a list of relative file descriptors.
 */
export const scanUploadsDirectory = (dir, rootDir = dir) => {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // Skip temporary chunk upload directories
    if (entry.isDirectory()) {
      if (entry.name === "temp") continue;
      results = results.concat(scanUploadsDirectory(fullPath, rootDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(rootDir, fullPath);
      const stats = fs.statSync(fullPath);
      results.push({
        fullPath,
        relativePath,
        basename: entry.name,
        size: stats.size,
      });
    }
  }

  return results;
};

/**
 * Identifies orphaned files by checking physical files against active database sets.
 */
export const identifyOrphanedFiles = (
  filesOnDisk,
  { activePaths, activeBasenames },
) => {
  return filesOnDisk.filter((file) => {
    const normalizedRelative = normalizeFilePath(file.relativePath);
    const basename = file.basename;

    // If either the relative path or the filename exists in active database records, KEEP it!
    const isReferenced =
      activePaths.has(normalizedRelative) || activeBasenames.has(basename);

    return !isReferenced;
  });
};

/**
 * Formats byte size into human readable string.
 */
export const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Main execution runner
 */
export const runOrphanCleanup = async ({
  uploadsDir = path.resolve(process.cwd(), "uploads"),
  prismaClient,
  isDryRun = true,
}) => {
  console.log("=================================================");
  console.log(
    `🔍 ORPHANED FILE SCANNER [Mode: ${isDryRun ? "DRY RUN (Safe)" : "CONFIRMED DELETION"}]`,
  );
  console.log(`📁 Uploads Directory: ${uploadsDir}`);
  console.log("=================================================\n");

  if (!fs.existsSync(uploadsDir)) {
    console.log("❌ Uploads directory does not exist. Nothing to scan.");
    return { scanned: 0, orphaned: 0, totalBytes: 0, deleted: 0 };
  }

  console.log("1. Querying active database records...");
  const activeSets = await fetchActiveDbFiles(prismaClient);
  console.log(
    `   Found ${activeSets.activePaths.size} active files referenced in database.\n`,
  );

  console.log("2. Scanning physical files in uploads directory...");
  const diskFiles = scanUploadsDirectory(uploadsDir);
  console.log(`   Found ${diskFiles.length} physical files on disk.\n`);

  console.log("3. Identifying unreferenced orphaned files...");
  const orphans = identifyOrphanedFiles(diskFiles, activeSets);
  const totalOrphanBytes = orphans.reduce((acc, f) => acc + f.size, 0);

  console.log(
    `   Found ${orphans.length} orphaned files (${formatBytes(totalOrphanBytes)}).\n`,
  );

  if (orphans.length === 0) {
    console.log(
      "🎉 Clean! No orphaned files found. All files on disk are actively referenced.",
    );
    return {
      scanned: diskFiles.length,
      orphaned: 0,
      totalBytes: 0,
      deleted: 0,
    };
  }

  console.log("-------------------------------------------------");
  console.log("LIST OF ORPHANED FILES TO CLEAN:");
  console.log("-------------------------------------------------");
  orphans.forEach((file, index) => {
    console.log(
      `[${index + 1}] ${file.relativePath} (${formatBytes(file.size)})`,
    );
  });
  console.log("-------------------------------------------------");
  console.log(
    `Total reclaimable disk space: ${formatBytes(totalOrphanBytes)}\n`,
  );

  if (isDryRun) {
    console.log("🛡️  DRY RUN COMPLETED. No files were deleted.");
    console.log(
      "👉 To delete these files, run the command with --confirm-delete\n",
    );
    return {
      scanned: diskFiles.length,
      orphaned: orphans.length,
      totalBytes: totalOrphanBytes,
      deleted: 0,
    };
  }

  // Deletion execution
  console.log("🗑️  Executing deletion of orphaned files...");
  let deletedCount = 0;
  for (const orphan of orphans) {
    // Security check: ensure path is strictly inside uploadsDir
    const isInside = orphan.fullPath.startsWith(uploadsDir + path.sep);
    if (!isInside) {
      console.warn(
        `⚠️ Skipped suspicious path outside uploads: ${orphan.fullPath}`,
      );
      continue;
    }

    try {
      if (fs.existsSync(orphan.fullPath)) {
        fs.unlinkSync(orphan.fullPath);
        deletedCount++;
      }
    } catch (err) {
      console.error(`❌ Failed to delete ${orphan.relativePath}:`, err.message);
    }
  }

  console.log(
    `\n✅ Deleted ${deletedCount} orphaned files. Reclaimed ${formatBytes(totalOrphanBytes)} disk space!`,
  );
  return {
    scanned: diskFiles.length,
    orphaned: orphans.length,
    totalBytes: totalOrphanBytes,
    deleted: deletedCount,
  };
};

// Direct CLI entry point
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("clean-orphaned-assets.mjs") ||
    process.argv[1].includes("clean-orphaned-assets"));

if (isDirectExecution) {
  const isConfirm = process.argv.includes("--confirm-delete");
  const isDryRun = !isConfirm;

  import("../src/db/prisma.mjs")
    .then(async ({ prisma }) => {
      try {
        await runOrphanCleanup({
          prismaClient: prisma,
          isDryRun,
        });
      } catch (e) {
        console.error("Fatal error running cleanup:", e);
      } finally {
        await prisma.$disconnect();
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("Failed to load prisma database client:", err);
      process.exit(1);
    });
}
