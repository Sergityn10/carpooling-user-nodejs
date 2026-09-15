import dotenv from "dotenv";
dotenv.config();
import Stripe from "stripe";
import prisma from "../lib/prisma.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { AccountSchemas } from "../schemas/account.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * GET /api/admin/accounts
 * Lista todas las cuentas de Stripe Connect con paginación y filtros.
 * Query params: limit, offset, charges_enabled, transfers_enabled, details_submitted, user_id
 */
const listAccounts = catchAsync(async (req, res, next) => {
  const limitRaw = req.query?.limit;
  const offsetRaw = req.query?.offset;
  const chargesFilter = req.query?.charges_enabled;
  const transfersFilter = req.query?.transfers_enabled;
  const detailsFilter = req.query?.details_submitted;
  const userIdFilter = req.query?.user_id;

  const limit = Number.isFinite(Number(limitRaw))
    ? Math.min(200, Math.max(1, Number(limitRaw)))
    : 50;
  const offset = Number.isFinite(Number(offsetRaw))
    ? Math.max(0, Number(offsetRaw))
    : 0;

  const where = {};
  if (chargesFilter === "true") where.charges_enabled = true;
  if (chargesFilter === "false") where.charges_enabled = false;
  if (transfersFilter === "true") where.transfers_enabled = true;
  if (transfersFilter === "false") where.transfers_enabled = false;
  if (detailsFilter === "true") where.details_submitted = true;
  if (detailsFilter === "false") where.details_submitted = false;
  if (userIdFilter) where.user_id = String(userIdFilter);

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { stripe_account_id: "asc" },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: { id: true, email: true, name: true, surname: true },
        },
      },
    }),
    prisma.account.count({ where }),
  ]);

  return res.status(200).send({
    status: "Success",
    accounts,
    total,
    limit,
    offset,
  });
});

/**
 * GET /api/admin/accounts/:stripeAccountId
 * Obtiene una cuenta específica por su stripe_account_id.
 */
const getAccount = catchAsync(async (req, res, next) => {
  const { stripeAccountId } = req.params;

  const account = await prisma.account.findUnique({
    where: { stripe_account_id: String(stripeAccountId) },
    include: {
      user: {
        select: { id: true, email: true, name: true, surname: true },
      },
    },
  });

  if (!account) {
    return next(
      new AppError("Cuenta no encontrada.", 404, "ACCOUNT_NOT_FOUND"),
    );
  }

  return res.status(200).send({
    status: "Success",
    account,
  });
});

/**
 * POST /api/admin/accounts
 * Crea un nuevo registro de cuenta manualmente.
 * Body: { stripe_account_id, user_id, charges_enabled?, transfers_enabled?, details_submitted?, default_account? }
 */
const createAccount = catchAsync(async (req, res, next) => {
  const result = AccountSchemas.validateAccount(req.body);
  if (!result.success) {
    return next(
      new AppError(
        `Datos inválidos: ${result.error.issues.map((i) => i.message).join(", ")}`,
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const existing = await prisma.account.findUnique({
    where: { stripe_account_id: result.data.stripe_account_id },
  });
  if (existing) {
    return next(
      new AppError(
        "Ya existe una cuenta con ese stripe_account_id.",
        409,
        "ACCOUNT_ALREADY_EXISTS",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: String(result.data.user_id) },
    select: { id: true },
  });
  if (!user) {
    return next(new AppError("Usuario no encontrado.", 404, "USER_NOT_FOUND"));
  }

  const account = await prisma.account.create({
    data: result.data,
    include: {
      user: {
        select: { id: true, email: true, name: true, surname: true },
      },
    },
  });

  return res.status(201).send({
    status: "Success",
    message: "Cuenta creada correctamente.",
    account,
  });
});

/**
 * PATCH /api/admin/accounts/:stripeAccountId
 * Actualiza los estados de una cuenta (charges_enabled, transfers_enabled, details_submitted, default_account).
 * Body: { charges_enabled?, transfers_enabled?, details_submitted?, default_account? }
 */
const updateAccount = catchAsync(async (req, res, next) => {
  const { stripeAccountId } = req.params;
  const result = AccountSchemas.validateAccountUpdate(req.body);
  if (!result.success) {
    return next(
      new AppError(
        `Datos inválidos: ${result.error.issues.map((i) => i.message).join(", ")}`,
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const existing = await prisma.account.findUnique({
    where: { stripe_account_id: String(stripeAccountId) },
  });
  if (!existing) {
    return next(
      new AppError("Cuenta no encontrada.", 404, "ACCOUNT_NOT_FOUND"),
    );
  }

  const account = await prisma.account.update({
    where: { stripe_account_id: String(stripeAccountId) },
    data: result.data,
    include: {
      user: {
        select: { id: true, email: true, name: true, surname: true },
      },
    },
  });

  return res.status(200).send({
    status: "Success",
    message: "Cuenta actualizada correctamente.",
    account,
  });
});

/**
 * DELETE /api/admin/accounts/:stripeAccountId
 * Elimina un registro de cuenta de la base de datos (no elimina la cuenta en Stripe).
 */
const deleteAccount = catchAsync(async (req, res, next) => {
  const { stripeAccountId } = req.params;

  const existing = await prisma.account.findUnique({
    where: { stripe_account_id: String(stripeAccountId) },
  });
  if (!existing) {
    return next(
      new AppError("Cuenta no encontrada.", 404, "ACCOUNT_NOT_FOUND"),
    );
  }

  await prisma.account.delete({
    where: { stripe_account_id: String(stripeAccountId) },
  });

  return res.status(200).send({
    status: "Success",
    message: "Cuenta eliminada correctamente.",
  });
});

/**
 * POST /api/admin/accounts/sync/:userId
 * Sincroniza el estado de la cuenta de Stripe Connect de un usuario hacia la BD.
 * Si el webhook falló y la BD no se actualizó, este endpoint obtiene la info
 * directamente de la API de Stripe y actualiza (o crea) el registro en la BD.
 */
const syncAccountFromStripe = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      id: true,
      stripe_account: true,
      email: true,
      name: true,
      surname: true,
    },
  });

  if (!user) {
    return next(new AppError("Usuario no encontrado.", 404, "USER_NOT_FOUND"));
  }

  if (!user.stripe_account) {
    return next(
      new AppError(
        "El usuario no tiene una cuenta de Stripe Connect asociada.",
        400,
        "STRIPE_ACCOUNT_MISSING",
      ),
    );
  }

  const stripeAccountId = user.stripe_account;

  let stripeAccount;
  try {
    stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
  } catch (err) {
    return next(
      new AppError(
        `Error al obtener la cuenta de Stripe: ${err?.message ?? err}`,
        err?.statusCode ?? 502,
        "STRIPE_ERROR",
      ),
    );
  }

  const chargesEnabled = Boolean(stripeAccount.charges_enabled);
  const transfersEnabled =
    String(stripeAccount?.capabilities?.transfers ?? "").toLowerCase() ===
    "active";
  const detailsSubmitted = Boolean(stripeAccount.details_submitted);

  const account = await prisma.account.upsert({
    where: { stripe_account_id: stripeAccountId },
    create: {
      stripe_account_id: stripeAccountId,
      user_id: String(userId),
      charges_enabled: chargesEnabled,
      transfers_enabled: transfersEnabled,
      details_submitted: detailsSubmitted,
    },
    update: {
      user_id: String(userId),
      charges_enabled: chargesEnabled,
      transfers_enabled: transfersEnabled,
      details_submitted: detailsSubmitted,
    },
    include: {
      user: {
        select: { id: true, email: true, name: true, surname: true },
      },
    },
  });

  return res.status(200).send({
    status: "Success",
    message: "Cuenta sincronizada correctamente desde Stripe.",
    account,
    stripe_data: {
      charges_enabled: chargesEnabled,
      transfers_enabled: transfersEnabled,
      details_submitted: detailsSubmitted,
      capabilities: stripeAccount?.capabilities ?? null,
    },
  });
});

export const methods = {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  syncAccountFromStripe,
};
