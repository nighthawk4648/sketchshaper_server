import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import socialService from "./social.service.mjs";

class SocialController {
  createSocial = catchError(async (req, res, next) => {
    const social = await socialService.createSocial({
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(201, "Social created successfully", social);
    res.status(201).json(resDoc);
  });

  updateSocial = catchError(async (req, res, next) => {
    const social = await socialService.updateSocial(req.params.id, {
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(200, "Social updated successfully", social);
    res.status(200).json(resDoc);
  });

  getSocials = catchError(async (req, res, next) => {
    const socials = await socialService.getSocials();
    const resDoc = responseHandler(
      200,
      "Socials retrieved successfully",
      socials,
    );
    res.status(200).json(resDoc);
  });

  getSocialsByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const socials = await socialService.getSocialsByPagination({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      order,
    });
    const resDoc = responseHandler(
      200,
      "Socials retrieved successfully",
      socials,
    );
    res.status(200).json(resDoc);
  });

  getSocial = catchError(async (req, res, next) => {
    const social = await socialService.getSocial(req.params.id);
    const resDoc = responseHandler(
      200,
      "Social retrieved successfully",
      social,
    );
    res.status(200).json(resDoc);
  });

  deleteSocial = catchError(async (req, res, next) => {
    await socialService.deleteSocial(req.params.id);
    const resDoc = responseHandler(200, "Social deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new SocialController();
