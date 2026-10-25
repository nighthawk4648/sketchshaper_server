import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import blogService from "./blog.service.mjs";
import { revalidateFrontend } from "../../utils/revalidate.mjs";

class BlogsController {
  createBlog = catchError(async (req, res, next) => {
    const {
      title,
      name,
      short_description,
      paragraph_one,
      paragraph_two,
      paragraph_three,
      back_link,
      image_alt,
      bg_image_alt,
      meta_title,
      meta_description,
      keywords,
    } = req.body;

    const files = req.files;

    const blog = await blogService.createBlog({
      title,
      name,
      short_description,
      paragraph_one,
      paragraph_two,
      paragraph_three,
      back_link,
      image_alt: image_alt?.trim() ? image_alt.trim().slice(0, 125) : null,
      bg_image_alt: bg_image_alt?.trim()
        ? bg_image_alt.trim().slice(0, 125)
        : null,
      meta_title: meta_title?.trim() || null,
      meta_description: meta_description?.trim() || null,
      keywords: keywords?.trim() || null,
      files,
    });
    revalidateFrontend(["blogs"]);
    const resDoc = responseHandler(201, "blog  created successfully", blog);
    res.status(201).json(resDoc);
  });

  updateBlog = catchError(async (req, res, next) => {
    const { id } = req.params;
    const {
      title,
      name,
      short_description,
      paragraph_one,
      paragraph_two,
      paragraph_three,
      back_link,
      image_alt,
      bg_image_alt,
      meta_title,
      meta_description,
      keywords,
    } = req.body;
    const files = req.files;

    const blog = await blogService.updateBlog(id, {
      title,
      name,
      short_description,
      paragraph_one,
      paragraph_two,
      paragraph_three,
      back_link,
      image_alt:
        image_alt !== undefined
          ? image_alt?.trim()
            ? image_alt.trim().slice(0, 125)
            : null
          : undefined,
      bg_image_alt:
        bg_image_alt !== undefined
          ? bg_image_alt?.trim()
            ? bg_image_alt.trim().slice(0, 125)
            : null
          : undefined,
      meta_title:
        meta_title !== undefined ? meta_title?.trim() || null : undefined,
      meta_description:
        meta_description !== undefined
          ? meta_description?.trim() || null
          : undefined,
      keywords: keywords !== undefined ? keywords?.trim() || null : undefined,
      files,
    });

    revalidateFrontend(["blogs", `blog-${id}`]);

    // Send response
    const resDoc = responseHandler(200, "blog updated successfully", blog);
    res.status(200).json(resDoc);
  });

  getBlog = catchError(async (req, res, next) => {
    const blog = await blogService.getBlog();
    const resDoc = responseHandler(200, "blog retrieved successfully", blog);
    res.status(200).json(resDoc);
  });

  getBlogByPagination = catchError(async (req, res, next) => {
    const { page, limit, order } = req.query;
    const blog = await blogService.getBlogByPagination({
      page: parseInt(page),
      limit: parseInt(limit),
      order,
    });
    const resDoc = responseHandler(200, "blog retrieved successfully", blog);
    res.status(200).json(resDoc);
  });

  getBlogById = catchError(async (req, res, next) => {
    const { id } = req.params;
    if (!id || !/^\d+$/.test(id)) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Blog not found",
      });
    }

    const blog = await blogService.getBlogById(id);
    if (!blog) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Blog not found",
      });
    }

    const resDoc = responseHandler(200, "blog retrieved successfully", blog);
    res.status(200).json(resDoc);
  });

  deleteBlog = catchError(async (req, res, next) => {
    await blogService.deleteBlog(req.params.id);
    revalidateFrontend(["blogs", `blog-${req.params.id}`]);
    const resDoc = responseHandler(200, "blog deleted successfully");
    res.status(200).json(resDoc);
  });
}

export default new BlogsController();
