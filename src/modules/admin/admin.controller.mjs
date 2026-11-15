import catchError from '../../middlewares/errors/catchError.mjs';
import responseHandler from '../../utils/responseHandler.mjs';
import adminService from './admin.service.mjs';
import {
	ADMIN_COOKIE,
	ADMIN_SESSION_MS,
	clearSessionCookie,
	createSession,
	deleteSession,
	readCookie,
	setSessionCookie,
} from '../../utils/session.mjs';

class AdminController {
	createAdmin = catchError(async (req, res, next) => {
		const { email, password } = req.body;
		const admin = await adminService.createAdmin({ email, password });
		const resDoc = responseHandler(201, 'Admin created successfully', admin);
		res.status(201).json(resDoc);
	});

	loginAdmin = catchError(async (req, res, next) => {
		const { email, password } = req.body;
		const admin = await adminService.loginAdmin({ email, password });
		const { token, expiresAt } = await createSession(
			{ kind: 'admin', adminId: admin.id, ttlMs: ADMIN_SESSION_MS },
			req
		);
		setSessionCookie(res, ADMIN_COOKIE, token, expiresAt);
		const resDoc = responseHandler(200, 'Admin logged in successfully', admin);
		res.status(200).json(resDoc);
	});

	// Ends this browser's session on the server, not just in the browser
	logoutAdmin = catchError(async (req, res, next) => {
		await deleteSession(readCookie(req, ADMIN_COOKIE));
		clearSessionCookie(res, ADMIN_COOKIE);
		res.status(200).json(responseHandler(200, 'Logged out'));
	});

	updateAdmin = catchError(async (req, res, next) => {
		const { email } = req.body;

		const payload = {
			email,
		};

		const admin = await adminService.updateAdmin(req.params.id, payload);
		const resDoc = responseHandler(200, 'Admin updated successfully', admin);
		res.status(200).json(resDoc);
	});

	getAdmins = catchError(async (req, res, next) => {
		const admins = await adminService.getAdmins();
		const resDoc = responseHandler(
			200,
			'Admins retrieved successfully',
			admins
		);
		res.status(200).json(resDoc);
	});

	getAdmin = catchError(async (req, res, next) => {
		const admin = await adminService.getAdmin(req.params.id);
		const resDoc = responseHandler(200, 'Admin retrieved successfully', admin);
		res.status(200).json(resDoc);
	});

	deleteAdmin = catchError(async (req, res, next) => {
		await adminService.deleteAdmin(req.params.id);
		const resDoc = responseHandler(200, 'Admin deleted successfully');
		res.status(200).json(resDoc);
	});
}

export default new AdminController();
