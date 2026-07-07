import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
dotenv.config();

async function getAllCompanies(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (search) {
      where.name = { contains: search };
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          _count: { select: { events: true } },
        },
        skip,
        take: limitNum,
        orderBy: { created_at: "desc" },
      }),
      prisma.company.count({ where }),
    ]);

    return res.status(200).send({
      status: "Success",
      companies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getCompanyById(req, res) {
  try {
    const { id } = req.params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        events: {
          include: { tags: { include: { tag: true } } },
        },
      },
    });

    if (!company) {
      return res
        .status(404)
        .send({ status: "Error", message: "Company not found" });
    }

    return res.status(200).send({ status: "Success", company });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function createCompany(req, res) {
  try {
    const { name, email, phone, website, logo, description } = req.body;

    if (!name || !email) {
      return res
        .status(400)
        .send({ status: "Error", message: "name and email are required" });
    }

    const existing = await prisma.company.findUnique({ where: { email } });
    if (existing) {
      return res
        .status(409)
        .send({ status: "Error", message: "Email already exists" });
    }

    const company = await prisma.company.create({
      data: { name, email, phone, website, logo, description },
    });

    return res.status(201).send({
      status: "Success",
      message: "Company created successfully",
      company,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function updateCompany(req, res) {
  try {
    const { id } = req.params;
    const { name, email, phone, website, logo, description } = req.body;

    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Company not found" });
    }

    if (email && email !== existing.email) {
      const emailExists = await prisma.company.findUnique({ where: { email } });
      if (emailExists) {
        return res
          .status(409)
          .send({ status: "Error", message: "Email already exists" });
      }
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (website !== undefined) data.website = website;
    if (logo !== undefined) data.logo = logo;
    if (description !== undefined) data.description = description;

    const company = await prisma.company.update({
      where: { id },
      data,
    });

    return res.status(200).send({
      status: "Success",
      message: "Company updated successfully",
      company,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function deleteCompany(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Company not found" });
    }

    await prisma.company.delete({ where: { id } });

    return res.status(200).send({
      status: "Success",
      message: "Company deleted successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

export const methods = {
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
};
