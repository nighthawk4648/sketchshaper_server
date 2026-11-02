import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import subcategoryService from "./sub.category.service.mjs";
import { revalidateFrontend } from "../../utils/revalidate.mjs";
import { prisma } from "../../db/prisma.mjs";

class SubCategoryController {
  createSubCategory = catchError(async (req, res, next) => {
    const category = await subcategoryService.createSubCategory({
      ...req.body,
      files: req.files,
    });
    const parentCatId = req.body.category_id
      ? parseInt(req.body.category_id)
      : null;
    revalidateFrontend([
      "sub-categories",
      "categories",
      parentCatId ? `category-${parentCatId}` : null,
      "assets",
      "general",
    ]);
    const resDoc = responseHandler(
      201,
      "SubCategory created successfully",
      category,
    );
    res.status(201).json(resDoc);
  });

  updateSubCategory = catchError(async (req, res, next) => {
    const subCatId = parseInt(req.params.id);
    const existingSub = !isNaN(subCatId)
      ? await prisma.subCategory.findUnique({ where: { id: subCatId } })
      : null;
    const oldCatId = existingSub?.category_id;
    const newCatId = req.body.category_id
      ? parseInt(req.body.category_id)
      : oldCatId;

    const category = await subcategoryService.updateSubCategory(req.params.id, {
      ...req.body,
      files: req.files,
    });

    const tagsToPurge = new Set([
      "sub-categories",
      `subcategory-${req.params.id}`,
      "categories",
      "assets",
      "general",
    ]);
    if (oldCatId) tagsToPurge.add(`category-${oldCatId}`);
    if (newCatId) tagsToPurge.add(`category-${newCatId}`);
    revalidateFrontend(Array.from(tagsToPurge));

    const resDoc = responseHandler(
      200,
      "SubCategory updated successfully",
      category,
    );
    res.status(200).json(resDoc);
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
    const { id } = req.params;
    if (!id || !/^\d+$/.test(id)) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "SubCategory not found",
      });
    }

    const category = await subcategoryService.getSubCategory(id);
    if (!category) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "SubCategory not found",
      });
    }

    const resDoc = responseHandler(200, "SubCategory retrieved successfully", category);
    res.status(200).json(resDoc);
  });

  deleteSubCategory = catchError(async (req, res, next) => {
    const subCatId = parseInt(req.params.id);
    const existingSub = !isNaN(subCatId)
      ? await prisma.subCategory.findUnique({ where: { id: subCatId } })
      : null;
    const catId = existingSub?.category_id;

    await subcategoryService.deleteSubCategory(req.params.id);

    const tagsToPurge = [
      "sub-categories",
      `subcategory-${req.params.id}`,
      "categories",
      "assets",
      "general",
    ];
    if (catId) tagsToPurge.push(`category-${catId}`);
    revalidateFrontend(tagsToPurge);

    const resDoc = responseHandler(200, "SubCategory deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new SubCategoryController();