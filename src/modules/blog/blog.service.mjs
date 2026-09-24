import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";

class BlogService {
  async createBlog(payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    // Construct data object for Prisma
    const {
      title,
      name,
      short_description,
      paragraph_one,
      paragraph_two,
      paragraph_three,
      back_link,
      meta_title,
      meta_description,
      keywords,
    } = payload;

    const blog = await prisma.blog.create({
      data: {
        title,
        short_description,
        paragraph_one,
        paragraph_two,
        paragraph_three,
        back_link,
        name,
        meta_title: meta_title || null,
        meta_description: meta_description || null,
        keywords: keywords || null,
        image: images.image || "",
        image_alt: payload.image_alt || null,
        bgImage: images.bgImage || "",
        bg_image_alt: payload.bg_image_alt || null,
      },
    });

    return blog;
  }

  async updateBlog(id, payload) {
    // Handle files
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename; // Map file fieldnames to filenames
      });
    }

    // Construct data object for Prisma
    const {
      title,
      name,
      short_description,
      paragraph_one,
      paragraph_two,
      paragraph_three,
      back_link,
      meta_title,
      meta_description,
      keywords,
    } = payload;

    const blog = await prisma.blog.update({
      where: {
        id: parseInt(id), // Ensure the ID is an integer
      },
      data: {
        title,
        name,
        short_description,
        paragraph_one,
        paragraph_two,
        paragraph_three,
        back_link,
        ...(meta_title !== undefined && { meta_title }),
        ...(meta_description !== undefined && { meta_description }),
        ...(keywords !== undefined && { keywords }),
        ...(images.image && { image: images.image }), // Only include image if it exists
        ...(images.bgImage && { bgImage: images.bgImage }), // Only include bgImage if it exists
        ...(payload.image_alt !== undefined && {
          image_alt: payload.image_alt,
        }),
        ...(payload.bg_image_alt !== undefined && {
          bg_image_alt: payload.bg_image_alt,
        }),
      },
    });

    return blog;
  }

  async getBlog() {
    // const blog = await blog.find();
    const blog = await prisma.blog.findMany();
    return blog;
  }

  async getBlogByPagination({ page = 1, limit = 10, order = "desc" }) {
    const sortOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const blogPromise = await prisma.blog.findMany({
      take: limit || 10,
      skip: (page - 1) * limit,
      orderBy: [
        {
          id: sortOrder,
        },
      ],
    });

    // const countPromise = blog.countDocuments();
    const countPromise = prisma.blog.count();

    const [blog, total] = await Promise.all([blogPromise, countPromise]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: blog,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async getBlogById(id) {
    // const blog = await blog.findById(id);
    const blog = await prisma.blog.findUnique({
      where: {
        id: parseInt(id),
      },
    });
    return blog;
  }

  async deleteBlog(id) {
    await prisma.blog.delete({
      where: {
        id: parseInt(id),
      },
    });
  }
}

export default new BlogService();
