import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { notificationsService } from "../services/notificationsService.js";
import { eventBus } from "../services/eventBus.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
dotenv.config();
const myEmail = process.env.EMAIL_YOUCONNEXT || "sermarled10@gmail.com";
const listSuggestions = catchAsync(async (req, res, next) => {
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
});

const getSuggestionById = catchAsync(async (req, res, next) => {
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
    return next(
      new AppError("Suggestion not found", 404, "SUGGESTION_NOT_FOUND"),
    );
  }

  return res.status(200).send({ status: "Success", suggestion });
});

const createSuggestion = catchAsync(async (req, res, next) => {
  const { name, email, website } = req.body;
  const userId = req.user?.id;

  if (!name || !email) {
    return next(
      new AppError("name and email are required", 400, "VALIDATION_ERROR"),
    );
  }

  if (!userId) {
    return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
  }

  const existing = await prisma.sugerenciasPromotoras.findUnique({
    where: { email },
  });
  if (existing) {
    return next(
      new AppError(
        "A suggestion with this email already exists",
        409,
        "SUGGESTION_EMAIL_DUPLICATE",
      ),
    );
  }

  const suggestion = await prisma.sugerenciasPromotoras.create({
    data: {
      name,
      email,
      website: website ?? null,
      suggested_by: userId,
    },
  });
  // try {
  //   notificationsService.sendSuggestionEmail({
  //     companyName: name,
  //     companyEmail: email,
  //     website: website ?? null,
  //     suggestionId: suggestion.id,
  //     userName: req.user?.name,
  //     userEmail: req.user?.email,
  //   });
  // } catch (e) {
  //   console.log("Error al intentar enviar el email de sugerencia");
  // }

  await eventBus.suggestionCreated(
    suggestion.id,
    name,
    email,
    website ?? null,
    req.user?.name,
    req.user?.email,
  );

  return res.status(201).send({
    status: "Success",
    message: "Suggestion created successfully",
    suggestion,
  });
});

const updateSuggestion = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, email, website, status } = req.body;

  const existing = await prisma.sugerenciasPromotoras.findUnique({
    where: { id },
  });
  if (!existing) {
    return next(
      new AppError("Suggestion not found", 404, "SUGGESTION_NOT_FOUND"),
    );
  }

  if (email && email !== existing.email) {
    const emailExists = await prisma.sugerenciasPromotoras.findUnique({
      where: { email },
    });
    if (emailExists) {
      return next(
        new AppError("Email already exists", 409, "SUGGESTION_EMAIL_DUPLICATE"),
      );
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
});

const deleteSuggestion = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const existing = await prisma.sugerenciasPromotoras.findUnique({
    where: { id },
  });
  if (!existing) {
    return next(
      new AppError("Suggestion not found", 404, "SUGGESTION_NOT_FOUND"),
    );
  }

  await prisma.sugerenciasPromotoras.delete({ where: { id } });

  return res.status(200).send({
    status: "Success",
    message: "Suggestion deleted successfully",
  });
});

const acceptSuggestion = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const suggestion = await prisma.sugerenciasPromotoras.findUnique({
    where: { id },
  });
  if (!suggestion) {
    return next(
      new AppError("Suggestion not found", 404, "SUGGESTION_NOT_FOUND"),
    );
  }

  if (suggestion.status === "accepted") {
    return next(
      new AppError(
        "Suggestion already accepted",
        409,
        "SUGGESTION_ALREADY_ACCEPTED",
      ),
    );
  }

  const existingCompany = await prisma.company.findUnique({
    where: { email: suggestion.email },
  });
  if (existingCompany) {
    return next(
      new AppError(
        "A company with this email already exists",
        409,
        "COMPANY_EMAIL_DUPLICATE",
      ),
    );
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

  await eventBus.suggestionAccepted(id, company.id);

  return res.status(201).send({
    status: "Success",
    message: "Suggestion accepted and company created",
    company,
  });
});

export const methods = {
  listSuggestions,
  getSuggestionById,
  createSuggestion,
  updateSuggestion,
  deleteSuggestion,
  acceptSuggestion,
};
