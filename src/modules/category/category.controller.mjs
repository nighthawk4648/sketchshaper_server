import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import categoryService from "./category.service.mjs";
import { revalidateFrontend } from "../../utils/revalidateFrontend.mjs";
import { buildCatalogTags } from "../../utils/revalidateTags.mjs";
import { prisma } from "../../db/prisma.mjs";

class CategoryController {
  createCategory = catchError(async (req, res, next) => {

    const category = await categoryService.createCategory({
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(201, "Category created successfully", category);
    res.status(201).json(resDoc);

    revalidateFrontend({
      tags: buildCatalogTags({
        categoryIds: category?.id,
      }),
    });
  });

  updateCategory = catchError(async (req, res, next) => {
    const catId = parseInt(req.params.id);

    // Fetch child subcategory IDs first, wrapped in .catch(() => null)
    const childSubCategories = await prisma.subCategory
      .findMany({
        where: { category_id: catId },
        select: { id: true },
      })
      .catch(() => null);

    const category = await categoryService.updateCategory(req.params.id, {
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(200, "Category updated successfully", category);
    res.status(200).json(resDoc);

    const subCategoryIds = (childSubCategories || []).map((s) => s.id);

    revalidateFrontend({
      tags: buildCatalogTags({
        subCategoryIds,
        categoryIds: req.params.id,
      }),
    });
  });

  getCategorys = catchError(async (req, res, next) => {
    const categorys = await categoryService.getCategorys();
    const resDoc = responseHandler(200, "Categorys retrieved successfully", categorys);
    res.status(200).json(resDoc);
  });

  getCategorysByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const categorys = await categoryService.getCategorysByPagination({ page: parseInt(page), limit: parseInt(limit), order });
    const resDoc = responseHandler(200, "Categorys retrieved successfully", categorys);
    res.status(200).json(resDoc);
  });

  getCategory = catchError(async (req, res, next) => {
    const { id } = req.params;
    
    // Validate ID
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        status: 'error',
        code: 400,
        message: 'Category ID is required'
      });
    }
    
    const category = await categoryService.getCategory(id);
    
    if (!category) {
      return res.status(404).json({
        status: 'error',
        code: 404,
        message: 'Category not found'
      });
    }
    
    const resDoc = responseHandler(200, "Category retrieved successfully", category);
    res.status(200).json(resDoc);
  });

  deleteCategory = catchError(async (req, res, next) => {
    const { id } = req.params;
    const catId = parseInt(id);

    // Fetch its subcategory ids and asset ids BEFORE deleting
    const existingCategory = await prisma.category
      .findUnique({
        where: { id: catId },
        select: {
          id: true,
          sub_categories: {
            select: {
              id: true,
              assets: {
                select: { id: true },
              },
            },
          },
        },
      })
      .catch(() => null);

    await categoryService.deleteCategory(id);
    const resDoc = responseHandler(200, "Category deleted successfully");
    res.status(200).json(resDoc);

    const subCategoryIds = [];
    const assetIds = [];
    if (existingCategory?.sub_categories) {
      for (const sub of existingCategory.sub_categories) {
        subCategoryIds.push(sub.id);
        if (sub.assets) {
          for (const a of sub.assets) {
            assetIds.push(a.id);
          }
        }
      }
    }

    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds,
        subCategoryIds,
        categoryIds: id,
      }),
    });
  });
}

export default new CategoryController();