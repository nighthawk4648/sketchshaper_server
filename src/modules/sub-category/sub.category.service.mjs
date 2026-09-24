import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";

class SubCategoryService {
  async createSubCategory(payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }
    // const category = await Category.findById(payload.category);

    // if (!category) {
    //   throw new Error("Category not found");
    // }

    // // create the subCategory
    // const subCategory = new SubCategory({
    //   ...payload,
    //   ...images,
    // });

    delete payload.files;

    const subCategory = await prisma.subCategory.create({
      data: {
        ...payload,
        category_id: parseInt(payload.category_id),
        ...images,
      },
    });

    return subCategory;
  }

  async updateSubCategory(id, payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    const categoryId =
      payload.category_id !== undefined &&
      payload.category_id !== null &&
      payload.category_id !== ""
        ? parseInt(payload.category_id)
        : undefined;

    delete payload.category_id;
    delete payload.files;

    const subCategory = await prisma.subCategory.update({
      where: {
        id: parseInt(id),
      },
      data: {
        ...payload,
        ...(categoryId !== undefined &&
          !isNaN(categoryId) && { category_id: categoryId }),
        ...images,
      },
    });
    return subCategory;
  }

  async getSubCategorys() {
    // const subCategorys = await SubCategory.find().populate('category');
    const subCategorys = await prisma.subCategory.findMany({
      include: {
        category: true,
      },
    });
    return subCategorys;
  }

  async getSubCategorysByPagination({ page = 1, limit = 10, order = "desc" }) {
    // const subCategorysPromise = SubCategory.find()
    //   .sort({ createdAt: order === 'asc' ? 1 : -1 })
    //   .skip((page - 1) * limit)
    //   .limit(limit)
    //   .populate('category');

    const subCategorysPromise = prisma.subCategory.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        id: order === "asc" ? "asc" : "desc",
      },
      include: {
        category: true,
      },
    });

    // const countPromise = SubCategory.countDocuments();
    const countPromise = prisma.subCategory.count();

    const [subCategorys, total] = await Promise.all([
      subCategorysPromise,
      countPromise,
    ]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: subCategorys,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async getSubCategory(id) {
    // const subCategory = await SubCategory.findById(id).populate(['category', 'assets']);
    const subCategory = await prisma.subCategory.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        category: true,
        assets: true,
      },
    });
    return subCategory;
  }

  async deleteSubCategory(id) {
    await prisma.subCategory.delete({
      where: {
        id: parseInt(id),
      },
    });
  }
}

export default new SubCategoryService();
