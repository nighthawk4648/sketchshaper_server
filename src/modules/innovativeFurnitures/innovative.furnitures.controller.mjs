import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { revalidateFrontend } from "../../utils/revalidateFrontend.mjs";
import innovativeFurnituresService from "./innovative.furnitures.service.mjs";

class InnovativeFurnituresController {
  createInnovative = catchError(async (req, res, next) => {
   
    const { title, short_description, urlOne, urlTwo, urlThree, urlFour } = req.body;

    const files = req.files;

    const innovativeFurnitures = await innovativeFurnituresService.createInnovative({
      title,
      short_description,
      urlOne,
      urlTwo,
      urlThree,
      urlFour,
      files, 
    });
    revalidateFrontend({ tags: ["innovative"], paths: ["/"] });
    const resDoc = responseHandler(201, "Innovative Furniture created successfully", innovativeFurnitures);
    res.status(201).json(resDoc);
  });


  updateInnovative = catchError(async (req, res, next) => {
    const { id } = req.params;
    const { title, short_description, urlOne, urlTwo, urlThree, urlFour } = req.body;
    const files = req.files;

    const updatedInnovativeFurniture = await innovativeFurnituresService.updateInnovative(id, {
      title,
      short_description,
      urlOne,
      urlTwo,
      urlThree,
      urlFour,
      files, 
    });

    revalidateFrontend({ tags: ["innovative"], paths: ["/"] });
    // Send response
    const resDoc = responseHandler(200, "Innovative Furniture updated successfully", updatedInnovativeFurniture);
    res.status(200).json(resDoc);
  });

  getInnovative = catchError(async (req, res, next) => {
    const innovativeFurnitures = await innovativeFurnituresService.getInnovative();
    const resDoc = responseHandler(200, "Innovative retrieved successfully", innovativeFurnitures);
    res.status(200).json(resDoc);
  });

  getInnovativesByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const innovativeFurnitures = await innovativeFurnituresService.getInnovativesByPagination({ page: parseInt(page), limit: parseInt(limit), order });
    const resDoc = responseHandler(200, "Innovative retrieved successfully", innovativeFurnitures);
    res.status(200).json(resDoc);
  });

  getInnovativeById = catchError(async (req, res, next) => {
    const innovativeFurnitures = await innovativeFurnituresService.getInnovativeById(req.params.id);
    const resDoc = responseHandler(200, "Innovative retrieved successfully", innovativeFurnitures);
    res.status(200).json(resDoc);
  });

  deleteInnovative = catchError(async (req, res, next) => {
    await innovativeFurnituresService.deleteInnovative(req.params.id);
    revalidateFrontend({ tags: ["innovative"], paths: ["/"] });
    const resDoc = responseHandler(200, "Innovative deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new InnovativeFurnituresController();