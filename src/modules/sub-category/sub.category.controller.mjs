import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import subcategoryService from "./sub.category.service.mjs";
import { revalidateFrontend } from "../../utils/revalidateFrontend.mjs";
import { buildCatalogTags } from "../../utils/revalidateTags.mjs";
import { prisma } from "../../db/prisma.mjs";

class SubCategoryController {
  createSubCategory = catchError(async (req, res, next) => {

    const category = await subcategoryService.createSubCategory({
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(201, "SubCategory created successfully", category);
    res.status(201).json(resDoc);

    const catId = category?.category_id || req.body?.category_id;
    revalidateFrontend({
      tags: buildCatalogTags({
        subCategoryIds: category?.id,
        categoryIds: catId,
      }),
    });
  });

  updateSubCategory = catchError(async (req, res, next) => {
    const subCatId = parseInt(req.params.id);
    const existingSubCategory = await prisma.subCategory
      .findUnique({
        where: { id: subCatId },
        select: { id: true, category_id: true },
      })
      .catch(() => null);

    const category = await subcategoryService.updateSubCategory(req.params.id, {
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(200, "SubCategory updated successfully", category);
    res.status(200).json(resDoc);

    const oldCatId = existingSubCategory?.category_id;
    const newCatId = category?.category_id || (req.body?.category_id ? parseInt(req.body.category_id) : undefined);
    const categoryIds = [oldCatId, newCatId].filter(Boolean);

    revalidateFrontend({
      tags: buildCatalogTags({
        subCategoryIds: req.params.id,
        categoryIds,
      }),
    });
  });

  getSubCategorys = catchError(async (req, res, next) => {
    const categorys = await subcategoryService.getSubCategorys();
    const resDoc = responseHandler(200, "SubCategorys retrieved successfully", categorys);
    res.status(200).json(resDoc);
  });

  getSubCategorysByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const categorys = await subcategoryService.getSubCategorysByPagination({ page: parseInt(page), limit: parseInt(limit), order });
    const resDoc = responseHandler(200, "SubCategorys retrieved successfully", categorys);
    res.status(200).json(resDoc);
  });


  getSubCategory = catchError(async (req, res, next) => {
    const category = await subcategoryService.getSubCategory(req.params.id);
    const resDoc = responseHandler(200, "SubCategory retrieved successfully", category);
    res.status(200).json(resDoc);
  });

  deleteSubCategory = catchError(async (req, res, next) => {
    const { id } = req.params;
    const subCatId = parseInt(id);

    // Fetch {id, category_id} and its child asset IDs BEFORE deleting
    const existingSubCategory = await prisma.subCategory
      .findUnique({
        where: { id: subCatId },
        select: {
          id: true,
          category_id: true,
          assets: {
            select: { id: true },
          },
        },
      })
      .catch(() => null);

    await subcategoryService.deleteSubCategory(id);
    const resDoc = responseHandler(200, "SubCategory deleted successfully");
    res.status(200).json(resDoc);

    const childAssetIds = (existingSubCategory?.assets || []).map((a) => a.id);
    const catId = existingSubCategory?.category_id;

    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds: childAssetIds,
        subCategoryIds: id,
        categoryIds: catId,
      }),
    });
  });
}

export default new SubCategoryController();