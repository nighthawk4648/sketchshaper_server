import { prisma } from "../../db/prisma.mjs";

class ExtensionDownloadService {
  async incrementDownloadCount(extensionName) {
    const extensionDownload = await prisma.extensionDownload.upsert({
      where: { name: extensionName },
      update: {
        count: {
          increment: 1,
        },
      },
      create: {
        name: extensionName,
        count: 1,
      },
    });

    return extensionDownload;
  }

  async getDownloadCount(extensionName) {
    const extensionDownload = await prisma.extensionDownload.findUnique({
      where: { name: extensionName },
    });

    if (!extensionDownload) {
      return {
        name: extensionName,
        count: 0,
      };
    }

    return extensionDownload;
  }

  async getAllDownloadCounts() {
    const extensions = await prisma.extensionDownload.findMany({
      orderBy: {
        count: "desc",
      },
    });

    return extensions;
  }

  async getDownloadCountByPagination({ page = 1, limit = 10, order = "desc" }) {
    const sortOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const extensionsPromise = prisma.extensionDownload.findMany({
      take: limit || 10,
      skip: (page - 1) * limit,
      orderBy: [
        {
          count: sortOrder,
        },
      ],
    });

    const countPromise = prisma.extensionDownload.count();

    const [extensions, total] = await Promise.all([
      extensionsPromise,
      countPromise,
    ]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: extensions,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async resetDownloadCount(extensionName) {
    const extensionDownload = await prisma.extensionDownload.update({
      where: { name: extensionName },
      data: {
        count: 0,
      },
    });

    return extensionDownload;
  }

  async deleteExtension(extensionName) {
    await prisma.extensionDownload.delete({
      where: { name: extensionName },
    });
  }
}

export default new ExtensionDownloadService();
