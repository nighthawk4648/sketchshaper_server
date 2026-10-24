import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import sliderService from "./slider.service.mjs";
import { revalidateFrontend } from "../../utils/revalidate.mjs";

class SliderController {
  createSlider = catchError(async (req, res, next) => {
    const { name, image, short_description } = req.body;
    const slider = await sliderService.createSlider({
      name,
      image,
      short_description,
      files: req.files,
    });
    revalidateFrontend(["sliders"]);
    const resDoc = responseHandler(201, "Slider created successfully", slider);
    res.status(201).json(resDoc);
  });

  updateSlider = catchError(async (req, res, next) => {
    const slider = await sliderService.updateSlider(req.params.id, {
      ...req.body,
      files: req.files,
    });
    revalidateFrontend(["sliders"]);
    const resDoc = responseHandler(200, "Slider updated successfully", slider);
    res.status(200).json(resDoc);
  });

  getSliders = catchError(async (req, res, next) => {
    const sliders = await sliderService.getSliders();
    const resDoc = responseHandler(200, "Sliders retrieved successfully", sliders);
    res.status(200).json(resDoc);
  });

  getSlidersByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const sliders = await sliderService.getSlidersByPagination({ page: parseInt(page), limit: parseInt(limit), order });
    const resDoc = responseHandler(200, "Sliders retrieved successfully", sliders);
    res.status(200).json(resDoc);
  });

  getSlider = catchError(async (req, res, next) => {
    const slider = await sliderService.getSlider(req.params.id);
    const resDoc = responseHandler(200, "Slider retrieved successfully", slider);
    res.status(200).json(resDoc);
  });

  deleteSlider = catchError(async (req, res, next) => {
    await sliderService.deleteSlider(req.params.id);
    revalidateFrontend(["sliders"]);
    const resDoc = responseHandler(200, "Slider deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new SliderController();