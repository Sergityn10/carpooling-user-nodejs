import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
dotenv.config();

function getSafeLogo(rawLogo) {
  if (!rawLogo || typeof rawLogo !== "string") return null;
  if (rawLogo.length <= 10000) return rawLogo;
  return null;
}

async function getAllCompanies(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const companyWhere = {};
    const enterpriseWhere = { is_active: true, is_deleted: false };
    if (search) {
      companyWhere.name = { contains: search };
      enterpriseWhere.OR = [
        { name: { contains: search } },
        { cif: { contains: search } },
      ];
    }

    const [companies, totalCompanies, enterprises, totalEnterprises] =
      await Promise.all([
        prisma.company.findMany({
          where: companyWhere,
          include: {
            _count: { select: { events: true } },
          },
          orderBy: { created_at: "desc" },
        }),
        prisma.company.count({ where: companyWhere }),
        prisma.enterprise.findMany({
          where: enterpriseWhere,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            website: true,
            logo: true,
            description: true,
            cif: true,
            created_at: true,
            _count: { select: { serviceEvents: true, platformEvents: true } },
          },
          orderBy: { created_at: "desc" },
        }),
        prisma.enterprise.count({ where: enterpriseWhere }),
      ]);

    const formattedEnterprises = enterprises.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      phone: e.phone,
      website: e.website,
      logo: getSafeLogo(e.logo),
      description: e.description,
      cif: e.cif,
      created_at: e.created_at,
      is_enterprise: true,
      _count: {
        events:
          (e._count?.serviceEvents ?? 0) + (e._count?.platformEvents ?? 0),
      },
    }));

    const all = [...companies, ...formattedEnterprises].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const total = totalCompanies + totalEnterprises;
    const paginated = all.slice(skip, skip + limitNum);

    return res.status(200).send({
      status: "Success",
      companies: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
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
      const enterprise = await prisma.enterprise.findUnique({
        where: { id },
        include: {
          platformEvents: {
            include: { tags: { include: { tag: true } } },
          },
        },
      });

      if (!enterprise) {
        return res
          .status(404)
          .send({ status: "Error", message: "Company not found" });
      }

      return res.status(200).send({
        status: "Success",
        company: {
          id: enterprise.id,
          name: enterprise.name,
          email: enterprise.email,
          phone: enterprise.phone,
          website: enterprise.website,
          logo: getSafeLogo(enterprise.logo),
          description: enterprise.description,
          is_enterprise: true,
          events: enterprise.platformEvents || [],
        },
      });
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
