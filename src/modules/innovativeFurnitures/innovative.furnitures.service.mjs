import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";

class InnovativeFurnituresService {
  async createInnovative(payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    // Construct data object for Prisma
    const { title, short_description, urlOne, urlTwo, urlThree, urlFour } =
      payload;

    const innovativeFurniture = await prisma.innovativeFurnitures.create({
      data: {
        title,
        short_description,
        urlOne,
        urlTwo,
        urlThree,
        urlFour,
        bgImg: images.bgImg || "",
      },
    });

    return innovativeFurniture;
  }

  async updateInnovative(id, payload) {
    // Handle files
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename; // Map file fieldnames to filenames
      });
    }

    // Construct data object for Prisma
    const { title, short_description, urlOne, urlTwo, urlThree, urlFour } =
      payload;

    const updatedInnovativeFurniture = await prisma.innovativeFurnitures.update(
      {
        where: {
          id: parseInt(id), // Ensure the ID is an integer
        },
        data: {
          title,
          short_description,
          urlOne,
          urlTwo,
          urlThree,
          urlFour,
          ...(images.bgImg && { bgImg: images.bgImg }), // Only include bgImg if it exists
        },
      },
    );

    return updatedInnovativeFurniture;
  }

  async getInnovative() {
    // const innovativeFurnitures = await innovativeFurnitures.find();
    const innovativeFurnitures = await prisma.innovativeFurnitures.findMany();
    return innovativeFurnitures;
  }

  async getInnovativesByPagination({ page = 1, limit = 10, order = "desc" }) {
    const sortOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const innovativeFurnituresPromise =
      await prisma.innovativeFurnitures.findMany({
        take: limit || 10,
        skip: (page - 1) * limit,
        orderBy: [
          {
            id: sortOrder,
          },
        ],
      });

    // const countPromise = innovativeFurnitures.countDocuments();
    const countPromise = prisma.innovativeFurnitures.count();

    const [innovativeFurnitures, total] = await Promise.all([
      innovativeFurnituresPromise,
      countPromise,
    ]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: innovativeFurnitures,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async getInnovativeById(id) {
    // const innovativeFurnitures = await innovativeFurnitures.findById(id);
    const innovativeFurnitures = await prisma.innovativeFurnitures.findUnique({
      where: {
        id: parseInt(id),
      },
    });
    return innovativeFurnitures;
  }

  async deleteInnovative(id) {
    await prisma.innovativeFurnitures.delete({
      where: {
        id: parseInt(id),
      },
    });
  }
}

export default new InnovativeFurnituresService();
