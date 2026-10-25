import catchError from '../../middlewares/errors/catchError.mjs';
import responseHandler from '../../utils/responseHandler.mjs';
import pageService from './page.service.mjs';

class PageController {
	createPage = catchError(async (req, res, next) => {
		const page = await pageService.createPage({
			...req.body,
			files: req.files,
		});
		const resDoc = responseHandler(201, 'Page created successfully', page);
		res.status(201).json(resDoc);
	});

	updatePage = catchError(async (req, res, next) => {
		const page = await pageService.updatePage(req.params.id, {
			...req.body,
			files: req.files,
		});
		const resDoc = responseHandler(200, 'Page updated successfully', page);
		res.status(200).json(resDoc);
	});

	getPages = catchError(async (req, res, next) => {
		const pages = await pageService.getPages();
		const resDoc = responseHandler(200, 'Pages retrieved successfully', pages);
		res.status(200).json(resDoc);
	});

	getPagesByPagination = catchError(async (req, res, next) => {
		const { page, limit, order } = req.query;
		const pages = await pageService.getPagesByPagination({
			page: parseInt(page),
			limit: parseInt(limit),
			order,
		});
		const resDoc = responseHandler(200, 'Pages retrieved successfully', pages);
		res.status(200).json(resDoc);
	});

	getPage = catchError(async (req, res, next) => {
		const { id } = req.params;
		if (!id || !/^\d+$/.test(id)) {
			return res.status(404).json({
				status: 'error',
				code: 404,
				message: 'Page not found',
			});
		}

		const page = await pageService.getPage(id);
		if (!page) {
			return res.status(404).json({
				status: 'error',
				code: 404,
				message: 'Page not found',
			});
		}

		const resDoc = responseHandler(200, 'Page retrieved successfully', page);
		res.status(200).json(resDoc);
	});

	deletePage = catchError(async (req, res, next) => {
		await pageService.deletePage(req.params.id);
		const resDoc = responseHandler(200, 'Page deleted successfully');
		res.status(200).json(resDoc);
	});
}

export default new PageController();
