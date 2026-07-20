import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { notificationsService } from "../services/notificationsService.js";
dotenv.config();
const myEmail = process.env.EMAIL_YOUCONNEXT || "sermarled10@gmail.com";
async function listSuggestions(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status) {
      where.status = status;
    }

    const [suggestions, total] = await Promise.all([
      prisma.sugerenciasPromotoras.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, img_perfil: true },
          },
        },
        skip,
        take: limitNum,
        orderBy: { created_at: "desc" },
      }),
      prisma.sugerenciasPromotoras.count({ where }),
    ]);

    return res.status(200).send({
      status: "Success",
      suggestions,
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

async function getSuggestionById(req, res) {
  try {
    const { id } = req.params;
    const suggestion = await prisma.sugerenciasPromotoras.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, img_perfil: true },
        },
      },
    });

    if (!suggestion) {
      return res
        .status(404)
        .send({ status: "Error", message: "Suggestion not found" });
    }

    return res.status(200).send({ status: "Success", suggestion });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function createSuggestion(req, res) {
  try {
    const { name, email, website } = req.body;
    const userId = req.user?.id;

    if (!name || !email) {
      return res
        .status(400)
        .send({ status: "Error", message: "name and email are required" });
    }

    if (!userId) {
      return res
        .status(401)
        .send({ status: "Error", message: "Authentication required" });
    }

    const existing = await prisma.sugerenciasPromotoras.findUnique({
      where: { email },
    });
    if (existing) {
      return res.status(409).send({
        status: "Error",
        message: "A suggestion with this email already exists",
      });
    }

    const suggestion = await prisma.sugerenciasPromotoras.create({
      data: {
        name,
        email,
        website: website ?? null,
        suggested_by: userId,
      },
    });
    try {
      notificationsService.sendSuggestionEmail({
        companyName: name,
        companyEmail: email,
        website: website ?? null,
        suggestionId: suggestion.id,
        userName: req.user?.name,
        userEmail: req.user?.email,
      });
    } catch (e) {
      console.log("Error al intentar enviar el email de sugerencia");
    }

    return res.status(201).send({
      status: "Success",
      message: "Suggestion created successfully",
      suggestion,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function updateSuggestion(req, res) {
  try {
    const { id } = req.params;
    const { name, email, website, status } = req.body;

    const existing = await prisma.sugerenciasPromotoras.findUnique({
      where: { id },
    });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Suggestion not found" });
    }

    if (email && email !== existing.email) {
      const emailExists = await prisma.sugerenciasPromotoras.findUnique({
        where: { email },
      });
      if (emailExists) {
        return res
          .status(409)
          .send({ status: "Error", message: "Email already exists" });
      }
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (website !== undefined) data.website = website;
    if (status !== undefined) data.status = status;

    const suggestion = await prisma.sugerenciasPromotoras.update({
      where: { id },
      data,
    });

    return res.status(200).send({
      status: "Success",
      message: "Suggestion updated successfully",
      suggestion,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function deleteSuggestion(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.sugerenciasPromotoras.findUnique({
      where: { id },
    });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Suggestion not found" });
    }

    await prisma.sugerenciasPromotoras.delete({ where: { id } });

    return res.status(200).send({
      status: "Success",
      message: "Suggestion deleted successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function acceptSuggestion(req, res) {
  try {
    const { id } = req.params;

    const suggestion = await prisma.sugerenciasPromotoras.findUnique({
      where: { id },
    });
    if (!suggestion) {
      return res
        .status(404)
        .send({ status: "Error", message: "Suggestion not found" });
    }

    if (suggestion.status === "accepted") {
      return res
        .status(409)
        .send({ status: "Error", message: "Suggestion already accepted" });
    }

    const existingCompany = await prisma.company.findUnique({
      where: { email: suggestion.email },
    });
    if (existingCompany) {
      return res.status(409).send({
        status: "Error",
        message: "A company with this email already exists",
      });
    }

    const company = await prisma.company.create({
      data: {
        name: suggestion.name,
        email: suggestion.email,
        website: suggestion.website,
      },
    });

    await prisma.sugerenciasPromotoras.update({
      where: { id },
      data: { status: "accepted" },
    });

    return res.status(201).send({
      status: "Success",
      message: "Suggestion accepted and company created",
      company,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

export const methods = {
  listSuggestions,
  getSuggestionById,
  createSuggestion,
  updateSuggestion,
  deleteSuggestion,
  acceptSuggestion,
};
