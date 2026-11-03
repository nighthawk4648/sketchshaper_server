import { prisma } from "../db/prisma.mjs";
import {
  notifyGoogleUrl,
  buildCanonicalAssetUrl,
  isGoogleAuthAvailable,
} from "../utils/googleIndexer.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function printUsageAndExit(exitCode = 1) {
  console.log(`
Usage:
  node src/scripts/indexGoogleUrls.mjs <url>                               # Submit a single URL
  node src/scripts/indexGoogleUrls.mjs --all                              # Submit all assets
  node src/scripts/indexGoogleUrls.mjs --limit <number>                   # Submit top N assets
  node src/scripts/indexGoogleUrls.mjs --all --offset <number>            # Resume from offset N
  node src/scripts/indexGoogleUrls.mjs --limit <number> --offset <number>  # Limit with offset
  `);
  process.exit(exitCode);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsageAndExit(args.length === 0 ? 1 : 0);
  }

  // 1. Single URL Mode
  if (!args[0].startsWith("--")) {
    const targetUrl = args[0];
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      console.error(`❌ Invalid URL provided: ${targetUrl}. Must start with http:// or https://`);
      process.exit(1);
    }

    if (!isGoogleAuthAvailable()) {
      console.error(
        "❌ Google service account key not found. Place 'google-indexing-key.json' in backend root or set GOOGLE_INDEXING_KEY_PATH."
      );
      process.exit(1);
    }

    console.log(`Submitting single URL: ${targetUrl}`);
    const result = await notifyGoogleUrl(targetUrl, "URL_UPDATED");
    process.exit(result.ok ? 0 : 1);
  }

  // 2. Batch Mode Argument Parsing & Validation
  let isAll = false;
  let limit = null;
  let offset = 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") {
      isAll = true;
    } else if (arg === "--limit") {
      const val = parseInt(args[i + 1], 10);
      if (isNaN(val) || val <= 0) {
        console.error(`❌ Invalid --limit value: "${args[i + 1]}". Must be a positive integer.`);
        printUsageAndExit(1);
      }
      limit = val;
      i++; // skip value
    } else if (arg === "--offset") {
      const val = parseInt(args[i + 1], 10);
      if (isNaN(val) || val < 0) {
        console.error(`❌ Invalid --offset value: "${args[i + 1]}". Must be 0 or a positive integer.`);
        printUsageAndExit(1);
      }
      offset = val;
      i++; // skip value
    } else {
      console.error(`❌ Unrecognized option: "${arg}"`);
      printUsageAndExit(1);
    }
  }

  if (!isAll && limit === null) {
    console.error("❌ Please specify either --all or --limit <number>.");
    printUsageAndExit(1);
  }

  // Pre-flight Google authentication check
  if (!isGoogleAuthAvailable()) {
    console.error(
      "❌ Google service account key not found. Place 'google-indexing-key.json' in backend root or set GOOGLE_INDEXING_KEY_PATH."
    );
    process.exit(1);
  }

  console.log(`Fetching assets from database (offset: ${offset}, limit: ${limit || "all"})...`);
  const assets = await prisma.asset.findMany({
    skip: offset > 0 ? offset : undefined,
    take: limit || undefined,
    include: {
      sub_category: {
        include: {
          category: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  if (assets.length === 0) {
    console.log(`No assets found matching the query (offset: ${offset}).`);
    process.exit(0);
  }

  console.log(`Found ${assets.length} assets to submit to Google Indexing API.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const canonicalUrl = buildCanonicalAssetUrl(asset);

    if (!canonicalUrl) {
      console.warn(`[${i + 1}/${assets.length}] Skipping asset #${asset.id}: could not build canonical URL`);
      continue;
    }

    console.log(`[${i + 1}/${assets.length}] Submitting: ${canonicalUrl}`);
    const result = await notifyGoogleUrl(canonicalUrl, "URL_UPDATED");

    if (result?.ok) {
      successCount++;
    } else if (result?.quotaExceeded || result?.permissionDenied) {
      const remaining = assets.length - i;
      const nextOffset = offset + i;
      const reason = result.quotaExceeded ? "daily quota reached" : "permission denied";
      console.log(`\n⚠️ Stopping: ${reason}.`);
      console.log(`Submitted: ${successCount}. Remaining in this batch: ${remaining}.`);
      console.log(
        `To resume next time, run:\n  npm run index:google -- ${limit ? `--limit ${limit}` : "--all"} --offset ${nextOffset}`
      );
      break;
    } else {
      failCount++;
    }

    // Google API quota throttle: wait 350ms between requests
    if (i < assets.length - 1) {
      await sleep(350);
    }
  }

  console.log(`\n🎉 Completed batch run!`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  process.exit(failCount > 0 && successCount === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
