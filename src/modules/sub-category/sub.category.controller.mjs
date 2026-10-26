import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import subcategoryService from "./sub.category.service.mjs";
import { revalidateFrontend } from "../../utils/revalidate.mjs";

class SubCategoryController {
  createSubCategory = catchError(async (req, res, next) => {

    const category = await subcategoryService.createSubCategory({
      ...req.body,
      files: req.files,
    });
    revalidateFrontend(["sub-categories", "categories", "general"]);
    const resDoc = responseHandler(201, "SubCategory created successfully", category);
    res.status(201).json(resDoc);
  });

  updateSubCategory = catchError(async (req, res, next) => {
    const category = await subcategoryService.updateSubCategory(req.params.id, {
      ...req.body,
      files: req.files,
    });
    revalidateFrontend(["sub-categories", `subcategory-${req.params.id}`, "categories", "general"]);
    const resDoc = responseHandler(200, "SubCategory updated successfully", category);
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
    await subcategoryService.deleteSubCategory(req.params.id);
    revalidateFrontend(["sub-categories", `subcategory-${req.params.id}`, "categories", "general"]);
    const resDoc = responseHandler(200, "SubCategory deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new SubCategoryController();