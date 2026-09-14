import { prisma } from "../../db/prisma.mjs";

class ContactService {
  async createContactMessage({ name, email, message }) {
    return prisma.contactMessage.create({
      data: { name, email, message },
    });
  }

  async getContactMessages({ page, limit, status }) {
    const where = status ? { status } : {};
    const [result, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.contactMessage.count({ where }),
    ]);

    return {
      result,
      pagination: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async getContactMessage(id) {
    return prisma.contactMessage.findUnique({ where: { id } });
  }

  async updateContactMessageStatus(id, status) {
    return prisma.contactMessage.update({
      where: { id },
      data: { status },
    });
  }

  async deleteContactMessage(id) {
    return prisma.contactMessage.delete({
      where: { id },
    });
  }
}

export default new ContactService();
