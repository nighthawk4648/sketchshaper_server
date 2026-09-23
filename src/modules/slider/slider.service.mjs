import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";

class SliderService {
  async createSlider(payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    const slider = await prisma.slider.create({
      data: {
        image: images.image || "",
        logo: images.logo || "",
        name: payload.name || payload.title || "",
        short_description: payload.short_description || "",
      },
    });
    return slider;
  }

  async updateSlider(id, payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    const slider = await prisma.slider.update({
      where: {
        id: parseInt(id),
      },
      data: {
        name: payload.name,
        short_description: payload.short_description,
        ...images,
      },
    });
    return slider;
  }

  async getSliders() {
    // const sliders = await Slider.find();
    const sliders = await prisma.slider.findMany();
    return sliders;
  }

  async getSlidersByPagination({ page = 1, limit = 10, order = "desc" }) {
    const sortOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const slidersPromise = await prisma.slider.findMany({
      take: limit || 10,
      skip: (page - 1) * limit,
      orderBy: [
        {
          id: sortOrder,
        },
      ],
    });

    // const countPromise = Slider.countDocuments();
    const countPromise = prisma.slider.count();

    const [sliders, total] = await Promise.all([slidersPromise, countPromise]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: sliders,
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async getSlider(id) {
    // const slider = await Slider.findById(id);
    const slider = await prisma.slider.findUnique({
      where: {
        id: parseInt(id),
      },
    });
    return slider;
  }

  async deleteSlider(id) {
    await prisma.slider.delete({
      where: {
        id: parseInt(id),
      },
    });
  }
}

export default new SliderService();
