import { prisma } from "../db/prisma.mjs";
import { importLegacyUsers } from "../modules/patreon/patreon.service.mjs";

// Run once after deploying: node src/scripts/importPatreonUsers.mjs
const result = await importLegacyUsers();
console.log(`Patreon users found: ${result.found}, imported: ${result.imported}`);
await prisma.$disconnect();
