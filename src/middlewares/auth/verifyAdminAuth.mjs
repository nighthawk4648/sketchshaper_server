import { config } from '../../config/config.mjs';
import { ADMIN_COOKIE, findSession, readCookie } from '../../utils/session.mjs';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ADMIN_ORIGINS = ['https://admin.sketchshaper.com'];

// Browsers send Origin on writes; refusing unknown ones stops other sites acting with the admin's cookie
export const isTrustedAdminOrigin = (origin, mode = config.mode) =>
	!origin || mode === 'dev' || ADMIN_ORIGINS.includes(origin);

/**
 * Admin access comes only from an admin session cookie. Bearer tokens (including
 * Patreon tokens) are ignored here, so a site login can never act as an admin.
 */
export const verifyAdminAuth = async (req, res, next) => {
	try {
		if (!SAFE_METHODS.has(req.method) && !isTrustedAdminOrigin(req.get('origin'))) {
			return res.status(403).json({
				status: 'error',
				code: 403,
				message: 'Request origin not allowed.',
			});
		}

		const session = await findSession(readCookie(req, ADMIN_COOKIE), 'admin');
		if (!session?.admin) {
			return res.status(401).json({
				status: 'error',
				code: 401,
				message: 'Please log in as admin.',
			});
		}

		req.admin = { id: session.admin.id, email: session.admin.email };
		next();
	} catch (error) {
		return res.status(500).json({
			status: 'error',
			code: 500,
			message: 'Authentication failed.',
		});
	}
};
