import dotenv from "dotenv";
dotenv.config();
import { UserSchemas } from "../schemas/user.js";
import { authorization } from "../middlewares/authorization.js";
import prisma from "../lib/prisma.js";
import { methods as utils } from "../utils/hashing.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import { GoogleMapsProvider } from "../providers/google-maps.js";
import { methods as paymentServices } from "./payment.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { eventBus } from "../services/eventBus.js";

const updateUserPatch = catchAsync(async (req, res, next) => {
  const result = UserSchemas.validateUserSchemaPartial(req.body);
  if (!result.success) {
    return next(
      new AppError(
        "Los datos proporcionados no son válidos.",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const { id } = req.params;

  const findUser = req.user ?? (await authorization.reviseCookie(req));
  if (!findUser || String(findUser.id) !== String(id)) {
    return next(
      new AppError(
        "No tienes permiso para modificar este usuario.",
        403,
        "FORBIDDEN",
      ),
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return next(new AppError("El usuario no existe.", 404, "USER_NOT_FOUND"));
  }

  if (result.data.password) {
    try {
      result.data.password = await utils.hashValue(10, result.data.password);
    } catch (hashError) {
      console.error("[updateUserPatch] Error hasheando contraseña:", hashError);
      return next(
        new AppError(
          "No se pudo procesar la contraseña. Inténtalo de nuevo.",
          500,
          "HASH_ERROR",
        ),
      );
    }
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    try {
      const allUsers = await prisma.user.findMany({
        select: { id: true, email: true, dni: true },
        where: { dni: { not: null } },
      });
      const collision = allUsers.find((r) => {
        if (!r?.dni) return false;
        try {
          const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
          return plain === dniCandidate && String(r.id) !== String(id);
        } catch {
          return false;
        }
      });
      if (collision) {
        return next(
          new AppError(
            "Ya existe un usuario registrado con este DNI/NIE.",
            409,
            "DNI_DUPLICATE",
          ),
        );
      }
    } catch (dniError) {
      console.error("[updateUserPatch] Error comprobando DNI:", dniError);
      return next(
        new AppError(
          "No se pudo verificar el DNI/NIE. Inténtalo de nuevo.",
          500,
          "DNI_CHECK_ERROR",
        ),
      );
    }
  }

  let updatesEncrypted;
  try {
    updatesEncrypted = cryptoUtils.encryptFields(
      result.data,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
  } catch (encryptError) {
    console.error("[updateUserPatch] Error encriptando datos:", encryptError);
    return next(
      new AppError(
        "No se pudieron procesar los datos. Inténtalo de nuevo.",
        500,
        "ENCRYPT_ERROR",
      ),
    );
  }

  const keys = Object.keys(updatesEncrypted);
  if (keys.length === 0) {
    return next(
      new AppError(
        "No se han enviado campos para actualizar.",
        400,
        "NO_FIELDS_TO_UPDATE",
      ),
    );
  }

  await prisma.user.update({ where: { id }, data: updatesEncrypted });

  paymentServices
    .updateStripeAccountFromProfile(id, result.data)
    .catch((err) =>
      console.error("[updateUserPatch] Error sincronizando con Stripe:", err),
    );

  await eventBus.userUpdated(id, result.data);

  return res.status(200).send({
    status: "Success",
    message: "Usuario actualizado correctamente.",
  });
});

const updateMyUserPatch = catchAsync(async (req, res, next) => {
  const result = UserSchemas.validateUserSchemaPartial(req.body);
  if (!result.success) {
    return next(
      new AppError(
        "Los datos proporcionados no son válidos.",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const findUser = req.user;
  if (!findUser) {
    return next(
      new AppError(
        "No se ha podido identificar tu sesión. Inicia sesión de nuevo.",
        401,
        "UNAUTHORIZED",
      ),
    );
  }

  if (result.data.password) {
    try {
      result.data.password = await utils.hashValue(10, result.data.password);
    } catch (hashError) {
      console.error(
        "[updateMyUserPatch] Error hasheando contraseña:",
        hashError,
      );
      return next(
        new AppError(
          "No se pudo procesar la contraseña. Inténtalo de nuevo.",
          500,
          "HASH_ERROR",
        ),
      );
    }
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    try {
      const allUsers = await prisma.user.findMany({
        select: { email: true, dni: true },
        where: { dni: { not: null } },
      });
      const collision = allUsers.find((r) => {
        if (!r?.dni) return false;
        try {
          const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
          return (
            plain === dniCandidate && String(r.email) !== String(findUser.email)
          );
        } catch {
          return false;
        }
      });
      if (collision) {
        return next(
          new AppError(
            "Ya existe un usuario registrado con este DNI/NIE.",
            409,
            "DNI_DUPLICATE",
          ),
        );
      }
    } catch (dniError) {
      console.error("[updateMyUserPatch] Error comprobando DNI:", dniError);
      return next(
        new AppError(
          "No se pudo verificar el DNI/NIE. Inténtalo de nuevo.",
          500,
          "DNI_CHECK_ERROR",
        ),
      );
    }
  }

  let updatesEncrypted;
  try {
    updatesEncrypted = cryptoUtils.encryptFields(
      result.data,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
  } catch (encryptError) {
    console.error("[updateMyUserPatch] Error encriptando datos:", encryptError);
    return next(
      new AppError(
        "No se pudieron procesar los datos. Inténtalo de nuevo.",
        500,
        "ENCRYPT_ERROR",
      ),
    );
  }

  const keys = Object.keys(updatesEncrypted);
  if (keys.length === 0) {
    return next(
      new AppError(
        "No se han enviado campos para actualizar.",
        400,
        "NO_FIELDS_TO_UPDATE",
      ),
    );
  }

  await prisma.user.update({
    where: { email: findUser.email },
    data: updatesEncrypted,
  });

  paymentServices
    .updateStripeAccountFromProfile(findUser.id, result.data)
    .catch((err) =>
      console.error("[updateMyUserPatch] Error sincronizando con Stripe:", err),
    );

  await eventBus.userUpdated(findUser.id, result.data);

  return res.status(200).send({
    status: "Success",
    message: "Usuario actualizado correctamente.",
  });
});

const removeUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const findUser = req.user ?? (await authorization.reviseCookie(req));
  if (!findUser) {
    return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
  }

  const isSelf = String(findUser.id) === String(id);
  const isAdmin = findUser.role?.name === "admin" || findUser.role === "admin";

  if (!isSelf && !isAdmin) {
    return next(
      new AppError(
        "No tienes permisos para eliminar a este usuario.",
        403,
        "FORBIDDEN",
      ),
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
  }

  if (isAdmin && isSelf) {
    return next(
      new AppError(
        "Un administrador no puede eliminarse a sí mismo.",
        400,
        "ADMIN_SELF_DELETE",
      ),
    );
  }

  await prisma.user.delete({ where: { id } });

  await eventBus.userDeleted(id, !isSelf);

  if (isSelf) {
    try {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      });
    } catch (_e) {}
  }

  return res.status(200).send({
    status: "Success",
    message: isSelf
      ? "User deleted successfully"
      : "Usuario eliminado correctamente por el administrador.",
  });
});

const getUserInfo = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const rawUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!rawUser) {
    return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
  }

  const user = cryptoUtils.decryptFields(
    rawUser,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  const [receivedComments, givenComments, userPreferences] = await Promise.all([
    prisma.comment.findMany({ where: { user_id_trayect: id } }),
    prisma.comment.findMany({ where: { user_id_commentator: id } }),
    prisma.userPreference.findMany({
      where: { user_id: id },
      select: { pref_key: true, value: true },
    }),
  ]);

  const numOpinions = receivedComments.length;
  const averageRating =
    numOpinions === 0
      ? 0
      : receivedComments.reduce((acc, c) => acc + c.rating, 0) / numOpinions;

  const preferences = {};
  userPreferences.forEach((row) => {
    preferences[row.pref_key] = row.value;
  });

  return res.status(200).send({
    status: "Success",
    message: "User found successfully",
    data: {
      userId: user.id,
      name: user.name,
      surname: user.surname,
      phone: user.phone,
      email: user.email,
      img_perfil: user.img_perfil,
      role: user.role?.name ?? "user",
      fecha_nacimiento: user.fecha_nacimiento,
      genero: user.genero,
      dni: user.dni,
      ciudad: user.ciudad,
      provincia: user.provincia,
      codigo_postal: user.codigo_postal,
      direccion: user.direccion,
      pais: user.pais,
      averageRating,
      numOpinions,
      myNumOpinions: givenComments.length,
      about_me: user.about_me,
      preferences,
    },
  });
});

function normalizeLocationText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

const getUniqueUsersByLocation = catchAsync(async (req, res, next) => {
  const rawLocation = req.query?.location;
  if (!rawLocation || normalizeLocationText(rawLocation).length < 2) {
    return next(
      new AppError(
        "Missing or invalid query param: location",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  let details;
  try {
    details = await GoogleMapsProvider.geocodeAddressDetails(rawLocation);
  } catch (error) {
    const msg = error?.message ?? String(error);
    return next(
      new AppError(`Ubicación no válida: ${msg}`, 400, "INVALID_LOCATION"),
    );
  }

  const city = details?.city;
  if (!city || normalizeLocationText(city).length === 0) {
    return next(
      new AppError(
        "La ubicación no corresponde a una ciudad reconocible (falta componente 'locality').",
        400,
        "INVALID_LOCATION",
      ),
    );
  }

  const rows = await prisma.$queryRaw`
    SELECT * FROM users
    WHERE ciudad IS NOT NULL
    AND TRIM(LOWER(ciudad)) = TRIM(LOWER(${city}))
  `;

  const decryptedRows = (rows ?? []).map((r) =>
    cryptoUtils.decryptFields(r, cryptoUtils.USER_SENSITIVE_FIELDS),
  );

  const seen = new Set();
  const users = [];
  for (const u of decryptedRows) {
    const key = u?.id ?? u?.email ?? null;
    const keyStr = key === null ? null : String(key);
    if (!keyStr) continue;
    if (seen.has(keyStr)) continue;
    seen.add(keyStr);
    users.push({
      id: u.id,
      name: u.name ?? null,
      surname: u.surname ?? null,
      img_perfil: u.img_perfil ?? null,
      ciudad: u.ciudad ?? null,
    });
  }

  return res.status(200).send({
    status: "Success",
    location: {
      query: String(rawLocation),
      normalized_city: city,
      formatted_address: details?.formatted_address ?? null,
      place_id: details?.place_id ?? null,
      lat: details?.lat ?? null,
      lng: details?.lng ?? null,
      country: details?.country ?? null,
    },
    count: users.length,
    users,
  });
});

const PROFILE_COMPLETENESS_FIELDS = [
  {
    campo: "dni",
    porcentaje_otorga: 35,
    mensaje_sugerido: "Añade tu DNI/NIE para poder realizar y recibir pagos.",
    check: (user) => Boolean(user.dni),
  },
  {
    campo: "coche",
    porcentaje_otorga: 30,
    mensaje_sugerido:
      "Registra al menos un coche con matrícula para poder ofrecer trayectos.",
    check: (_user, carCount) => carCount > 0,
  },
  {
    campo: "telefono",
    porcentaje_otorga: 15,
    mensaje_sugerido:
      "Añade tu teléfono para mejorar la seguridad de tu cuenta.",
    check: (user) => Boolean(user.phone),
  },
  {
    campo: "avatar",
    porcentaje_otorga: 10,
    mensaje_sugerido:
      "Sube una foto de perfil para que otros usuarios te reconozcan.",
    check: (user) => Boolean(user.img_perfil),
  },
  {
    campo: "nombre",
    porcentaje_otorga: 5,
    mensaje_sugerido: "Añade tu nombre para personalizar tu perfil.",
    check: (user) => Boolean(user.name),
  },
  {
    campo: "apellidos",
    porcentaje_otorga: 5,
    mensaje_sugerido: "Añade tus apellidos para completar tu perfil.",
    check: (user) => Boolean(user.surname),
  },
];

const CAE_COMPLETENESS_FIELDS = [
  {
    campo: "dni",
    porcentaje_otorga: 35,
    mensaje_sugerido:
      "Añade tu DNI/NIE para poder generar CAEs (requerido por el Anexo III antifraude).",
    check: (user) => Boolean(user.dni),
  },
  {
    campo: "coche",
    porcentaje_otorga: 30,
    mensaje_sugerido:
      "Registra al menos un coche con matrícula para poder generar CAEs de tus trayectos.",
    check: (_user, carCount) => carCount > 0,
  },
  {
    campo: "telefono",
    porcentaje_otorga: 15,
    mensaje_sugerido:
      "Añade tu teléfono para incluirlo en el listado de viajeros del CAE.",
    check: (user) => Boolean(user.phone),
  },
  {
    campo: "nombre",
    porcentaje_otorga: 10,
    mensaje_sugerido:
      "Añade tu nombre para incluirlo en el listado de viajeros del CAE.",
    check: (user) => Boolean(user.name),
  },
  {
    campo: "apellidos",
    porcentaje_otorga: 10,
    mensaje_sugerido:
      "Añade tus apellidos para completar el listado de viajeros del CAE.",
    check: (user) => Boolean(user.surname),
  },
];

function calculateCompleteness(fields, user, carCount = 0) {
  let porcentaje_total = 0;
  const campos_faltantes = [];

  for (const field of fields) {
    const isComplete = field.check(user, carCount);
    if (isComplete) {
      porcentaje_total += field.porcentaje_otorga;
    } else {
      campos_faltantes.push({
        campo: field.campo,
        porcentaje_otorga: field.porcentaje_otorga,
        mensaje_sugerido: field.mensaje_sugerido,
      });
    }
  }

  porcentaje_total = Math.min(100, porcentaje_total);

  return { porcentaje_total, campos_faltantes };
}

const getMyUserInfo = catchAsync(async (req, res, next) => {
  const findUser = req.user;

  const [
    receivedComments,
    givenComments,
    userPreferences,
    carCount,
    stripeAccount,
    walletAccount,
  ] = await Promise.all([
    prisma.comment.findMany({ where: { user_id_trayect: findUser.id } }),
    prisma.comment.findMany({ where: { user_id_commentator: findUser.id } }),
    prisma.userPreference.findMany({
      where: { user_id: findUser.id },
      select: { pref_key: true, value: true },
    }),
    prisma.car.count({ where: { user_id: String(findUser.id) } }),
    findUser.stripe_account
      ? prisma.account.findUnique({
          where: { stripe_account_id: findUser.stripe_account },
          select: {
            charges_enabled: true,
            transfers_enabled: true,
            details_submitted: true,
          },
        })
      : Promise.resolve(null),
    prisma.walletAccount.findFirst({
      where: { user_id: String(findUser.id), currency: "eur" },
      select: { id: true, balance: true, status: true },
    }),
  ]);

  const numOpinions = receivedComments.length;
  const averageRating =
    numOpinions === 0
      ? 0
      : receivedComments.reduce((acc, c) => acc + c.rating, 0) / numOpinions;

  const preferences = {};
  userPreferences.forEach((row) => {
    preferences[row.pref_key] = row.value;
  });

  const completitud = calculateCompleteness(
    PROFILE_COMPLETENESS_FIELDS,
    findUser,
    carCount,
  );
  const completitud_cae = calculateCompleteness(
    CAE_COMPLETENESS_FIELDS,
    findUser,
    carCount,
  );

  const monedero = {
    disponible:
      Boolean(stripeAccount?.charges_enabled) &&
      Boolean(stripeAccount?.transfers_enabled),
    stripe_account: Boolean(findUser.stripe_account),
    onboarding_completado: Boolean(findUser.onboarding_ended),
    charges_enabled: Boolean(stripeAccount?.charges_enabled),
    transfers_enabled: Boolean(stripeAccount?.transfers_enabled),
    details_submitted: Boolean(stripeAccount?.details_submitted),
    wallet_activa: walletAccount?.status === "active",
    wallet_balance: walletAccount ? Number(walletAccount.balance) : 0,
    mensaje: !findUser.stripe_account
      ? "No tienes cuenta Stripe Connect configurada."
      : !findUser.onboarding_ended
        ? "Completa el onboarding de Stripe para poder recibir ganancias."
        : !stripeAccount?.charges_enabled
          ? "Tu cuenta Stripe no tiene cobros habilitados."
          : !stripeAccount?.transfers_enabled
            ? "Tu cuenta Stripe no tiene transferencias habilitadas."
            : walletAccount?.status === "blocked"
              ? "Tu monedero está bloqueado. Contacta con soporte."
              : "Tu monedero está disponible para recibir ganancias.",
  };

  return res.status(200).send({
    status: "Success",
    message: "User found successfully",
    data: {
      name: findUser.name,
      surname: findUser.surname,
      phone: findUser.phone,
      email: findUser.email,
      img_perfil: findUser.img_perfil,
      role: findUser.role?.name ?? "user",
      fecha_nacimiento: findUser.fecha_nacimiento,
      genero: findUser.genero,
      dni: findUser.dni,
      ciudad: findUser.ciudad,
      provincia: findUser.provincia,
      codigo_postal: findUser.codigo_postal,
      direccion: findUser.direccion,
      pais: findUser.pais,
      averageRating,
      numOpinions,
      myNumOpinions: givenComments.length,
      about_me: findUser.about_me,
      preferences,
    },
    completitud,
    completitud_cae,
    monedero,
  });
});

const getPublicUserInfo = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const rawUser = await prisma.user.findUnique({
    where: { id: String(id) },
    select: { id: true, name: true, surname: true, img_perfil: true },
  });

  if (!rawUser) {
    return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
  }

  const user = cryptoUtils.decryptFields(rawUser, ["name", "surname"]);

  return res.status(200).send({ status: "Success", user });
});

const getPublicUsersBatch = catchAsync(async (req, res, next) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(
      new AppError("ids must be a non-empty array", 400, "VALIDATION_ERROR"),
    );
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids.map(String) } },
    select: { id: true, name: true, surname: true, img_perfil: true },
  });

  const decryptedUsers = users.map((u) =>
    cryptoUtils.decryptFields(u, ["name", "surname"]),
  );

  return res.status(200).send({ status: "Success", users: decryptedUsers });
});

const getPublicUserProfile = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const rawUser = await prisma.user.findUnique({
    where: { id: String(id) },
    select: {
      id: true,
      name: true,
      surname: true,
      img_perfil: true,
      about_me: true,
      genero: true,
      fecha_nacimiento: true,
      ciudad: true,
      provincia: true,
      pais: true,
      created_at: true,
      cars: {
        select: {
          id_coche: true,
          marca: true,
          modelo: true,
          color: true,
          tipo_combustible: true,
          num_plazas: true,
          year: true,
        },
      },
      commentsReceived: {
        select: {
          id_comment: true,
          opinion: true,
          rating: true,
          id_trayecto: true,
          user_id_commentator: true,
        },
      },
      _count: {
        select: {
          eventParticipations: true,
        },
      },
    },
  });

  if (!rawUser) {
    return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
  }

  const user = cryptoUtils.decryptFields(rawUser, [
    "name",
    "surname",
    "fecha_nacimiento",
    "provincia",
  ]);

  const comments = user.commentsReceived ?? [];
  const totalComments = comments.length;
  const avgRating =
    totalComments > 0
      ? Math.round(
          (comments.reduce((sum, c) => sum + (c.rating ?? 0), 0) /
            totalComments) *
            10,
        ) / 10
      : 0;

  const { commentsReceived, _count, ...publicFields } = user;

  return res.status(200).send({
    status: "Success",
    user: {
      ...publicFields,
      cars: user.cars,
      stats: {
        avg_rating: avgRating,
        total_comments: totalComments,
        events_joined: _count?.eventParticipations ?? 0,
      },
      recent_comments: comments
        .sort((a, b) => b.id_comment.localeCompare(a.id_comment))
        .slice(0, 5),
    },
  });
});

export const methods = {
  updateUserPatch,
  removeUser,
  getUserInfo,
  updateMyUserPatch,
  getMyUserInfo,
  getUniqueUsersByLocation,
  getPublicUserInfo,
  getPublicUsersBatch,
  getPublicUserProfile,
};
