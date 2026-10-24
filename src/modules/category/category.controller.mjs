import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import categoryService from "./category.service.mjs";
import { revalidateFrontend } from "../../utils/revalidate.mjs";

class CategoryController {
  createCategory = catchError(async (req, res, next) => {

    const category = await categoryService.createCategory({
      ...req.body,
      files: req.files,
    });
    revalidateFrontend(["categories", "general"]);
    const resDoc = responseHandler(201, "Category created successfully", category);
    res.status(201).json(resDoc);
  });

  updateCategory = catchError(async (req, res, next) => {
    const category = await categoryService.updateCategory(req.params.id, {
      ...req.body,
      files: req.files,
    });
    revalidateFrontend(["categories", `category-${req.params.id}`, "general"]);
    const resDoc = responseHandler(200, "Category updated successfully", category);
    res.status(200).json(resDoc);
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
    await categoryService.deleteCategory(req.params.id);
    revalidateFrontend(["categories", `category-${req.params.id}`, "general"]);
    const resDoc = responseHandler(200, "Category deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new CategoryController();