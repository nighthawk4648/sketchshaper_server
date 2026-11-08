import { prisma } from "../../db/prisma.mjs";
import { buildContactWhere } from "./contact.validation.mjs";

class ContactService {
  async createContactMessage(data) {
    return prisma.contactMessage.create({
      data,
    });
  }

  async getContactMessages({ page, limit, status, service_type }) {
    const where = buildContactWhere({ status, service_type });
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
