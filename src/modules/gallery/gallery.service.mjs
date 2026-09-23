import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";

class GalleryService {
  async createGallery(payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    delete payload.files;

    const gallery = await prisma.gallery.create({
      data: { ...payload, ...images },
    });
    return gallery;
  }

  async updateGallery(id, payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    delete payload.files;
    const gallery = await prisma.gallery.update({
      where: {
        id: parseInt(id),
      },
      data: {
        ...payload,
        ...images,
      },
    });
    return gallery;
  }

  async getGalleries() {
    const galleries = await prisma.gallery.findMany({
      orderBy: {
        id: "desc",
      },
    });
    return galleries;
  }

  async getGalleryByPagination({ page = 1, limit = 10, order = "desc" }) {
    const sortOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const galleriesPromise = prisma.gallery.findMany({
      take: limit || 10,
      skip: (page - 1) * limit,
      orderBy: [
        {
          id: sortOrder,
        },
      ],
    });

    const countPromise = prisma.gallery.count();

    const [galleries, total] = await Promise.all([
      galleriesPromise,
      countPromise,
    ]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: galleries,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async getGallery(id) {
    const gallery = await prisma.gallery.findUnique({
      where: {
        id: parseInt(id),
      },
    });

    return gallery;
  }

  async deleteGallery(id) {
    await prisma.gallery.delete({
      where: {
        id: parseInt(id),
      },
    });
  }
}

export default new GalleryService();
