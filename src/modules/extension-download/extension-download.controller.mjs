import catchError from '../../middlewares/errors/catchError.mjs';
import responseHandler from '../../utils/responseHandler.mjs';
import extensionDownloadService from './extension-download.service.mjs';
import { revalidateFrontend } from '../../utils/revalidateFrontend.mjs';

class ExtensionDownloadController {
	incrementDownloadCount = catchError(async (req, res, next) => {
		const { extensionName } = req.body;

		if (!extensionName) {
			const resDoc = responseHandler(400, 'Extension name is required');
			return res.status(400).json(resDoc);
		}

		const result = await extensionDownloadService.incrementDownloadCount(extensionName);
		const resDoc = responseHandler(200, 'Download count incremented successfully', result);
		res.status(200).json(resDoc);
	});

	getDownloadCount = catchError(async (req, res, next) => {
		const { extensionName } = req.params;

		if (!extensionName) {
			const resDoc = responseHandler(400, 'Extension name is required');
			return res.status(400).json(resDoc);
		}

		const result = await extensionDownloadService.getDownloadCount(extensionName);
		const resDoc = responseHandler(200, 'Download count retrieved successfully', result);
		res.status(200).json(resDoc);
	});

	getAllDownloadCounts = catchError(async (req, res, next) => {
		const extensions = await extensionDownloadService.getAllDownloadCounts();
		const resDoc = responseHandler(200, 'All download counts retrieved successfully', extensions);
		res.status(200).json(resDoc);
	});

	getDownloadCountByPagination = catchError(async (req, res, next) => {
		const { page, limit, order } = req.query;
		const result = await extensionDownloadService.getDownloadCountByPagination({
			page: parseInt(page) || 1,
			limit: parseInt(limit) || 10,
			order: order || 'desc',
		});
		const resDoc = responseHandler(200, 'Download counts retrieved successfully', result);
		res.status(200).json(resDoc);
	});

	resetDownloadCount = catchError(async (req, res, next) => {
		const { extensionName } = req.params;

		if (!extensionName) {
			const resDoc = responseHandler(400, 'Extension name is required');
			return res.status(400).json(resDoc);
		}

		const result = await extensionDownloadService.resetDownloadCount(extensionName);
		const resDoc = responseHandler(200, 'Download count reset successfully', result);
		res.status(200).json(resDoc);

		revalidateFrontend({ tags: ["extension-downloads"] });
	});

	deleteExtension = catchError(async (req, res, next) => {
		const { extensionName } = req.params;

		if (!extensionName) {
			const resDoc = responseHandler(400, 'Extension name is required');
			return res.status(400).json(resDoc);
		}

		await extensionDownloadService.deleteExtension(extensionName);
		const resDoc = responseHandler(200, 'Extension deleted successfully');
		res.status(200).json(resDoc);

		revalidateFrontend({ tags: ["extension-downloads"] });
	});
}

export default new ExtensionDownloadController();
