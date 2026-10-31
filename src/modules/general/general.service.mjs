import { prisma } from '../../db/prisma.mjs';
import isArrayElementExist from '../../utils/isArrayElementExist.mjs';

class GeneralService {
	async upsertAboutUs(payload) {
		const images = {};
		if (isArrayElementExist(payload.files)) {
			payload.files.forEach((file) => {
				images[file.fieldname] = file.filename;
			});
		}

		delete payload.files;
		delete payload.slug;

		const existingAboutUs = await prisma.aboutUs.findUnique({
			where: {
				slug: 'about-us'
			}
		});

		const coverValue = images.cover || payload.cover || existingAboutUs?.cover || "";

		const updateData = {};
		if (payload.title !== undefined) updateData.title = payload.title;
		if (payload.short_description !== undefined) updateData.short_description = payload.short_description;
		if (payload.content !== undefined) updateData.content = payload.content;
		if (coverValue) updateData.cover = coverValue;

		const createData = {
			title: payload.title || existingAboutUs?.title || "ABOUT US",
			short_description: payload.short_description || existingAboutUs?.short_description || "",
			content: payload.content || existingAboutUs?.content || "",
			cover: coverValue,
			slug: 'about-us',
		};

		const aboutUs = await prisma.aboutUs.upsert({
			where: {
				slug: 'about-us'
			},
			update: updateData,
			create: createData
		});

		return aboutUs;
	}

	async getAboutUs() {
		// find with slug name about-us
		// const aboutUs = await AboutUs.findOne({ slug: 'about-us' });
		const aboutUs = await prisma.aboutUs.findUnique({
			where: {
				slug: 'about-us'
			}
		});
		return aboutUs;
	}

	async upsertApplicationSettings(payload) {

		const images = {};
		if (isArrayElementExist(payload.files)) {
			payload.files.forEach((file) => {
				images[file.fieldname] = file.filename;
			});
		}

		// const settings = await Setting.findOneAndUpdate(
		// 	{
		// 		slug: 'settings',
		// 	},
		// 	{
		// 		$set: { ...payload, ...images },
		// 	},
		// 	{ new: true, upsert: true }
		// );


		delete payload.files;
		delete payload.slug;

		const settings = await prisma.setting.upsert({
			where: {
				slug: 'settings'
			},
			update: {
				...payload,
				...images
			},
			create: {
				...payload,
				...images,
				slug: 'settings'
			}
		});

		return settings;
	}

	async getApplicationSettings() {
		// find with slug name settings
		// const settings = await Setting.findOne({ slug: 'settings' });
		const settings = await prisma.setting.findUnique({
			where: {
				slug: 'settings'
			}
		});
		return settings;
	}
}

export default new GeneralService();
