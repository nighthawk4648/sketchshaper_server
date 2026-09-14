import { prisma } from "../../db/prisma.mjs";

class CommonService {
  async search(searchTerm) {
    const categoryPromise = prisma.category.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { short_description: { contains: searchTerm } },
        ],
      },
    });

    const subCategoryPromise = prisma.subCategory.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { short_description: { contains: searchTerm } },
        ],
      },
    });

    const assetPromise = prisma.asset.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { short_description: { contains: searchTerm } },
        ],
      },
    });

    const [category, subCategory, asset] = await Promise.all([
      categoryPromise,
      subCategoryPromise,
      assetPromise,
    ]);

    return {
      category,
      subCategory,
      asset,
    };
  }
}

export default new CommonService();
