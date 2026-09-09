import dotenv from "dotenv";
dotenv.config();
import prisma from "../lib/prisma.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { WalletConfigSchemas } from "../schemas/walletConfig.js";
import { eventBus } from "../services/eventBus.js";

const DEFAULT_CONFIG = {
  wallet_enabled: true,
  recharges_enabled: true,
  payouts_enabled: true,
  payments_enabled: true,
  min_recharge_cents: 100,
  max_recharge_cents: 500000,
  max_daily_payout_cents: 100000,
};

/**
 * GET /api/admin/wallet-config/:userId
 * Obtiene la configuración del monedero de un usuario.
 * Si no existe registro, devuelve los valores por defecto.
 */
const getWalletConfig = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { id: true },
  });
  if (!user) {
    return next(new AppError("Usuario no encontrado.", 404, "USER_NOT_FOUND"));
  }

  const config = await prisma.walletConfig.findUnique({
    where: { user_id: String(userId) },
  });

  return res.status(200).send({
    status: "Success",
    config: config ?? { user_id: String(userId), ...DEFAULT_CONFIG },
  });
});

/**
 * GET /api/admin/wallet-config
 * Lista todas las configuraciones de monedero con paginación.
 */
const listWalletConfigs = catchAsync(async (req, res, next) => {
  const limitRaw = req.query?.limit;
  const offsetRaw = req.query?.offset;
  const enabledFilter = req.query?.wallet_enabled;

  const limit = Number.isFinite(Number(limitRaw))
    ? Math.min(200, Math.max(1, Number(limitRaw)))
    : 50;
  const offset = Number.isFinite(Number(offsetRaw))
    ? Math.max(0, Number(offsetRaw))
    : 0;

  const where = {};
  if (enabledFilter === "true") where.wallet_enabled = true;
  if (enabledFilter === "false") where.wallet_enabled = false;

  const [configs, total] = await Promise.all([
    prisma.walletConfig.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: { id: true, email: true, name: true, surname: true },
        },
      },
    }),
    prisma.walletConfig.count({ where }),
  ]);

  return res.status(200).send({
    status: "Success",
    configs,
    total,
    limit,
    offset,
  });
});

/**
 * PUT /api/admin/wallet-config/:userId
 * Crea o actualiza la configuración del monedero de un usuario.
 * Usa upsert para que funcione tanto si no existe como si ya existe.
 */
const upsertWalletConfig = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const result = WalletConfigSchemas.validateWalletConfigUpdate(req.body);
  if (!result.success) {
    return next(
      new AppError(
        `Datos inválidos: ${result.error.issues.map((i) => i.message).join(", ")}`,
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { id: true },
  });
  if (!user) {
    return next(new AppError("Usuario no encontrado.", 404, "USER_NOT_FOUND"));
  }

  const adminId = String(req.user.id);

  const config = await prisma.walletConfig.upsert({
    where: { user_id: String(userId) },
    create: {
      user_id: String(userId),
      ...result.data,
      updated_by: adminId,
    },
    update: {
      ...result.data,
      updated_by: adminId,
    },
  });

  await eventBus.walletConfigUpdated(String(userId), config, adminId);

  return res.status(200).send({
    status: "Success",
    message: "Configuración del monedero actualizada correctamente.",
    config,
  });
});

/**
 * PATCH /api/admin/wallet-config/:userId/toggle
 * Activa o desactiva el monedero completo con un solo endpoint.
 * Body: { wallet_enabled: boolean }
 */
const toggleWallet = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { wallet_enabled } = req.body;

  if (typeof wallet_enabled !== "boolean") {
    return next(
      new AppError(
        "wallet_enabled debe ser un valor booleano.",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { id: true },
  });
  if (!user) {
    return next(new AppError("Usuario no encontrado.", 404, "USER_NOT_FOUND"));
  }

  const adminId = String(req.user.id);

  const config = await prisma.walletConfig.upsert({
    where: { user_id: String(userId) },
    create: {
      user_id: String(userId),
      wallet_enabled,
      updated_by: adminId,
    },
    update: {
      wallet_enabled,
      updated_by: adminId,
    },
  });

  await eventBus.walletConfigUpdated(String(userId), config, adminId);

  return res.status(200).send({
    status: "Success",
    message: `Monedero ${wallet_enabled ? "activado" : "desactivado"} correctamente.`,
    config,
  });
});

/**
 * DELETE /api/admin/wallet-config/:userId
 * Elimina la configuración personalizada y restaura los valores por defecto.
 */
const resetWalletConfig = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { id: true },
  });
  if (!user) {
    return next(new AppError("Usuario no encontrado.", 404, "USER_NOT_FOUND"));
  }

  await prisma.walletConfig.deleteMany({
    where: { user_id: String(userId) },
  });

  await eventBus.walletConfigUpdated(
    String(userId),
    { user_id: String(userId), ...DEFAULT_CONFIG },
    String(req.user.id),
  );

  return res.status(200).send({
    status: "Success",
    message: "Configuración del monedero restaurada a valores por defecto.",
    config: { user_id: String(userId), ...DEFAULT_CONFIG },
  });
});

/**
 * GET /api/wallet-config/me
 * Obtiene la configuración del monedero del usuario autenticado.
 */
const getMyWalletConfig = catchAsync(async (req, res, next) => {
  const userId = String(req.user.id);

  const config = await prisma.walletConfig.findUnique({
    where: { user_id: userId },
  });

  return res.status(200).send({
    status: "Success",
    config: config ?? { user_id: userId, ...DEFAULT_CONFIG },
  });
});

export const methods = {
  getWalletConfig,
  listWalletConfigs,
  upsertWalletConfig,
  toggleWallet,
  resetWalletConfig,
  getMyWalletConfig,
};

export { DEFAULT_CONFIG };
