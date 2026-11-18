import bcrypt from 'bcrypt';
import { prisma } from '../../db/prisma.mjs';
class AdminService {
	async createAdmin(payload) {
		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(payload.password, salt);

		// create the admin
		const user = await prisma.user.create({
			data: {
				email: payload.email,
				password: hashedPassword,
			},
			// Never send the password hash back
			select: { id: true, email: true },
		});

		return user;
	}

	async loginAdmin(payload) {
		const { email, password } = payload;

		const admin = await prisma.user.findUnique({
			where: {
				email,
			},
		});

		if (!admin) {
			throw new Error('Invalid email or password');
		}

		const validPassword = await bcrypt.compare(password, admin.password);
		if (!validPassword) {
			throw new Error('Invalid email or password');
		}

		// The controller turns this into an admin session cookie
		return {
			id: admin.id,
			email: admin.email,
		};
	}

	async updateAdmin(id, payload) {
		const admin = await prisma.user.update({
			where: {
				id: parseInt(id),
			},
			data: {
				email: payload.email,
			},
		});

		return admin;
	}

	async getAdmins() {
		const admins = await prisma.user.findMany({
			select: {
				id: true,
				email: true,
			},
		});
		return admins;
	}

	async getAdmin(id) {
		// const admin = await Admin.findById(id).populate('role').select('-password');
		const admin = await prisma.user.findUnique({
			where: {
				id: parseInt(id),

			},
			select: {
				id: true,
				email: true,
			},
		});
		return admin;
	}

	async deleteAdmin(id) {
		await prisma.user.delete({
			where: {
				id: parseInt(id),
			},
		});
	}
}

export default new AdminService();
