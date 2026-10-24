import catchError from '../../middlewares/errors/catchError.mjs';
import responseHandler from '../../utils/responseHandler.mjs';
import adminService from './general.service.mjs';
import { revalidateFrontend } from '../../utils/revalidate.mjs';

class GeneralController {
	upsertAboutUs = catchError(async (req, res, next) => {
		const aboutUs = await adminService.upsertAboutUs({
			...req.body, files: req.files
		});
		revalidateFrontend(["general"]);
		const resDoc = responseHandler(
			200,
			'About Us updated successfully',
			aboutUs
		);
		res.status(200).json(resDoc);
	});

	getAboutUs = catchError(async (req, res, next) => {
		const aboutUs = await adminService.getAboutUs();
		const resDoc = responseHandler(
			200,
			'About Us retrieved successfully',
			aboutUs
		);
		res.status(200).json(resDoc);
	});

	upsertApplicationSettings = catchError(async (req, res, next) => {
		const settings = await adminService.upsertApplicationSettings({ ...req.body, files: req.files });
		revalidateFrontend(["general"]);
		const resDoc = responseHandler(
			200,
			'Application settings updated successfully',
			settings
		);
		res.status(200).json(resDoc);
	});

	getApplicationSettings = catchError(async (req, res, next) => {
		const settings = await adminService.getApplicationSettings();
		const resDoc = responseHandler(
			200,
			'Application settings retrieved successfully',
			settings
		);
		res.status(200).json(resDoc);
	});
}

export default new GeneralController();
