import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";

class CategoryService {
  async createCategory(payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    delete payload.files;

    // create the category
    const category = await prisma.category.create({
      data: { ...payload, ...images },
    });
    return category;
  }

  async updateCategory(id, payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    delete payload.files;
    const category = await prisma.category.update({
      where: {
        id: parseInt(id),
      },
      data: {
        ...payload,
        ...images,
      },
    });
    return category;
  }

  async getCategorys() {
    // const categorys = await Category.find();
    const categorys = await prisma.category.findMany({
      include: {
        sub_categories: {
          include: {
            assets: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });
    return categorys;
  }

  async getCategorysByPagination({ page = 1, limit = 10, order = "desc" }) {
    const sortOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const categorysPromise = prisma.category.findMany({
      take: limit || 10,
      skip: (page - 1) * limit,
      orderBy: [
        {
          id: sortOrder,
        },
      ],
      include: {
        sub_categories: true,
      },
    });

    // const countPromise = Category.countDocuments();
    const countPromise = prisma.category.count();

    const [categorys, total] = await Promise.all([
      categorysPromise,
      countPromise,
    ]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: categorys,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  // async getCategory(id) {
  // 	// const category = await Category.findById(id).populate('sub_categories');
  // 	const category = await prisma.category.findUnique({
  // 		where: {
  // 			id: parseInt(id),
  // 		},
  // 		// include: {
  // 		// 	sub_categories: true,
  // 		// },
  // 		include: {
  // 			sub_categories: {
  // 				include: {
  // 					assets: true,
  // 				},
  // 			},
  // 		},
  // 	});

  // 	return category;
  // }

  async getCategory(id) {
    const category = await prisma.category.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        sub_categories: {
          include: {
            assets: {
              include: {
                sub_category: {
                  select: {
                    id: true,
                    name: true,
                    category: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return category;
  }

  async deleteCategory(id) {
    await prisma.category.delete({
      where: {
        id: parseInt(id),
      },
    });
  }
}

export default new CategoryService();
