import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { revalidateFrontend } from "../../utils/revalidateFrontend.mjs";
import supportedByService from "./supportedBy.service.mjs";

class SupportedByController {
  createSupportedBy = catchError(async (req, res, next) => {

    const { title, short_description, } = req.body;

    const files = req.files;

    const supportedBy = await supportedByService.createsupportedBy({
      title,
      short_description,
      files, 
    });

    revalidateFrontend({ tags: ["supportedby"], paths: ["/"] });
    const resDoc = responseHandler(201, "supportedBy created successfully", supportedBy);
    res.status(201).json(resDoc);
  });
  

  updateSupportedBy = catchError(async (req, res, next) => {
    const supportedBy = await supportedByService.updateSupportedBy(req.params.id, {
      ...req.body,
      files: req.files,
    });
    revalidateFrontend({ tags: ["supportedby"], paths: ["/"] });
    const resDoc = responseHandler(200, "supportedBy updated successfully", supportedBy);
    res.status(200).json(resDoc);
  });

  getSupportedBy = catchError(async (req, res, next) => {
    const supportedBy = await supportedByService.getSupportedBy();
    const resDoc = responseHandler(200, "supportedBy retrieved successfully", supportedBy);
    res.status(200).json(resDoc);
  });

  getSupportedByByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const supportedBy = await supportedByService.getSupportedByByPagination({ page: parseInt(page), limit: parseInt(limit), order });
    const resDoc = responseHandler(200, "supportedBy retrieved successfully", supportedBy);
    res.status(200).json(resDoc);
  });

  getSupportedByById = catchError(async (req, res, next) => {
    const supportedBy = await supportedByService.getSupportedByById(req.params.id);
    const resDoc = responseHandler(200, "supportedBy retrieved successfully", supportedBy);
    res.status(200).json(resDoc);
  });

  deleteSupportedBy = catchError(async (req, res, next) => {
    await supportedByService.deleteSupportedBy(req.params.id);
    revalidateFrontend({ tags: ["supportedby"], paths: ["/"] });
    const resDoc = responseHandler(200, "supportedBy deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new SupportedByController();