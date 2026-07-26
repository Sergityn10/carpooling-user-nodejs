import dotenv from "dotenv";
dotenv.config();
import { UserSchemas } from "../schemas/user.js";
import { authorization } from "../middlewares/authorization.js";
import prisma from "../lib/prisma.js";
import { methods as utils } from "../utils/hashing.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import { GoogleMapsProvider } from "../providers/google-maps.js";
import { methods as paymentServices } from "./payment.js";
import { trayectosService } from "../services/trayectosService.js";

async function countUserViajes(conductor) {
  // trayectos table is managed by another microservice.
  // This should be fetched via an API call to the trayectos microservice.
  return 0;
}

async function updateUserPatch(req, res) {
  try {
    const result = UserSchemas.validateUserSchemaPartial(req.body);
    if (!result.success) {
      return res.status(400).send({
        status: "Error",
        message: "Los datos proporcionados no son válidos.",
        details: JSON.parse(result.error.message),
      });
    }

    const { id } = req.params;

    const findUser = req.user ?? (await authorization.reviseCookie(req));
    if (!findUser || String(findUser.id) !== String(id)) {
      return res.status(401).send({
        status: "Error",
        message: "No tienes permiso para modificar este usuario.",
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).send({
        status: "Error",
        message: "El usuario no existe.",
      });
    }

    if (result.data.password) {
      try {
        result.data.password = await utils.hashValue(10, result.data.password);
      } catch (hashError) {
        console.error(
          "[updateUserPatch] Error hasheando contraseña:",
          hashError,
        );
        return res.status(500).send({
          status: "Error",
          message: "No se pudo procesar la contraseña. Inténtalo de nuevo.",
        });
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
          return res.status(409).send({
            status: "Error",
            message: "Ya existe un usuario registrado con este DNI/NIE.",
          });
        }
      } catch (dniError) {
        console.error("[updateUserPatch] Error comprobando DNI:", dniError);
        return res.status(500).send({
          status: "Error",
          message: "No se pudo verificar el DNI/NIE. Inténtalo de nuevo.",
        });
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
      return res.status(500).send({
        status: "Error",
        message: "No se pudieron procesar los datos. Inténtalo de nuevo.",
      });
    }

    const keys = Object.keys(updatesEncrypted);
    if (keys.length === 0) {
      return res.status(400).send({
        status: "Error",
        message: "No se han enviado campos para actualizar.",
      });
    }

    try {
      await prisma.user.update({ where: { id }, data: updatesEncrypted });
    } catch (dbError) {
      console.error("[updateUserPatch] Error en base de datos:", dbError);
      if (dbError?.code === "P2002") {
        return res.status(409).send({
          status: "Error",
          message:
            "Ya existe un usuario con alguno de los datos proporcionados (email, DNI, etc.).",
        });
      }
      return res.status(500).send({
        status: "Error",
        message:
          "No se pudo actualizar el usuario. Inténtalo de nuevo más tarde.",
      });
    }

    paymentServices
      .updateStripeAccountFromProfile(id, result.data)
      .catch((err) =>
        console.error("[updateUserPatch] Error sincronizando con Stripe:", err),
      );

    return res.status(200).send({
      status: "Success",
      message: "Usuario actualizado correctamente.",
    });
  } catch (error) {
    console.error("[updateUserPatch] Error no controlado:", error);
    return res.status(500).send({
      status: "Error",
      message: "Se produjo un error inesperado. Inténtalo de nuevo más tarde.",
    });
  }
}

async function updateMyUserPatch(req, res) {
  try {
    const result = UserSchemas.validateUserSchemaPartial(req.body);
    if (!result.success) {
      return res.status(400).send({
        status: "Error",
        message: "Los datos proporcionados no son válidos.",
        details: JSON.parse(result.error.message),
      });
    }

    const findUser = req.user;
    if (!findUser) {
      return res.status(401).send({
        status: "Error",
        message:
          "No se ha podido identificar tu sesión. Inicia sesión de nuevo.",
      });
    }

    if (result.data.password) {
      try {
        result.data.password = await utils.hashValue(10, result.data.password);
      } catch (hashError) {
        console.error(
          "[updateMyUserPatch] Error hasheando contraseña:",
          hashError,
        );
        return res.status(500).send({
          status: "Error",
          message: "No se pudo procesar la contraseña. Inténtalo de nuevo.",
        });
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
              plain === dniCandidate &&
              String(r.email) !== String(findUser.email)
            );
          } catch {
            return false;
          }
        });
        if (collision) {
          return res.status(409).send({
            status: "Error",
            message: "Ya existe un usuario registrado con este DNI/NIE.",
          });
        }
      } catch (dniError) {
        console.error("[updateMyUserPatch] Error comprobando DNI:", dniError);
        return res.status(500).send({
          status: "Error",
          message: "No se pudo verificar el DNI/NIE. Inténtalo de nuevo.",
        });
      }
    }

    let updatesEncrypted;
    try {
      updatesEncrypted = cryptoUtils.encryptFields(
        result.data,
        cryptoUtils.USER_SENSITIVE_FIELDS,
      );
    } catch (encryptError) {
      console.error(
        "[updateMyUserPatch] Error encriptando datos:",
        encryptError,
      );
      return res.status(500).send({
        status: "Error",
        message: "No se pudieron procesar los datos. Inténtalo de nuevo.",
      });
    }

    const keys = Object.keys(updatesEncrypted);
    if (keys.length === 0) {
      return res.status(400).send({
        status: "Error",
        message: "No se han enviado campos para actualizar.",
      });
    }

    try {
      await prisma.user.update({
        where: { email: findUser.email },
        data: updatesEncrypted,
      });
    } catch (dbError) {
      console.error("[updateMyUserPatch] Error en base de datos:", dbError);
      if (dbError?.code === "P2002") {
        return res.status(409).send({
          status: "Error",
          message:
            "Ya existe un usuario con alguno de los datos proporcionados (email, DNI, etc.).",
        });
      }
      return res.status(500).send({
        status: "Error",
        message:
          "No se pudo actualizar el usuario. Inténtalo de nuevo más tarde.",
      });
    }

    paymentServices
      .updateStripeAccountFromProfile(findUser.id, result.data)
      .catch((err) =>
        console.error(
          "[updateMyUserPatch] Error sincronizando con Stripe:",
          err,
        ),
      );

    return res.status(200).send({
      status: "Success",
      message: "Usuario actualizado correctamente.",
    });
  } catch (error) {
    console.error("[updateMyUserPatch] Error no controlado:", error);
    return res.status(500).send({
      status: "Error",
      message: "Se produjo un error inesperado. Inténtalo de nuevo más tarde.",
    });
  }
}

async function removeUser(req, res) {
  const { id } = req.params;

  const findUser = req.user ?? (await authorization.reviseCookie(req));
  if (!findUser || String(findUser.id) !== String(id)) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res
        .status(404)
        .send({ status: "Error", message: "User not found" });
    }

    // MySQL FK cascade deletes automatically propagate to:
    // accounts → payment_intents, cars, comments, refreshTokens,
    // walletAccounts → walletTransactions → walletPayouts,
    // walletRecharges, telegramInfo, disponibilidades, preferences
    await prisma.user.delete({ where: { id } });

    try {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        domain: process.env.ORIGIN,
      });
    } catch (_e) {}

    return res
      .status(200)
      .send({ status: "Success", message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to delete user" });
  }
}

async function getUserInfo(req, res) {
  const { id } = req.params;

  const rawUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  const user = cryptoUtils.decryptFields(
    rawUser,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );
  if (!user) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }

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

  let viajes = 0;
  try {
    viajes = await countUserViajes(user.id);
  } catch (_e) {
    viajes = 0;
  }

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
      viajes,
      preferences,
    },
  });
}

function normalizeLocationText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

async function getUniqueUsersByLocation(req, res) {
  const rawLocation = req.query?.location;
  if (!rawLocation || normalizeLocationText(rawLocation).length < 2) {
    return res.status(400).send({
      status: "Error",
      message: "Missing or invalid query param: location",
    });
  }

  let details;
  try {
    details = await GoogleMapsProvider.geocodeAddressDetails(rawLocation);
  } catch (error) {
    const msg = error?.message ?? String(error);
    return res
      .status(400)
      .send({ status: "Error", message: `Ubicación no válida: ${msg}` });
  }

  const city = details?.city;
  if (!city || normalizeLocationText(city).length === 0) {
    return res.status(400).send({
      status: "Error",
      message:
        "La ubicación no corresponde a una ciudad reconocible (falta componente 'locality').",
    });
  }

  let rows;
  try {
    rows = await prisma.$queryRaw`
      SELECT * FROM users
      WHERE ciudad IS NOT NULL
      AND TRIM(LOWER(ciudad)) = TRIM(LOWER(${city}))
    `;
  } catch (error) {
    console.error("Error fetching users by location:", error);
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to fetch users" });
  }

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
}

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

async function getMyUserInfo(req, res) {
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

  let viajes = 0;
  try {
    viajes = await countUserViajes(findUser.id);
  } catch (_e) {
    viajes = 0;
  }

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
      viajes,
      preferences,
    },
    completitud,
    completitud_cae,
    monedero,
  });
}

async function getPublicUserInfo(req, res) {
  try {
    const { id } = req.params;
    const rawUser = await prisma.user.findUnique({
      where: { id: String(id) },
      select: { id: true, name: true, surname: true, img_perfil: true },
    });

    if (!rawUser) {
      return res
        .status(404)
        .send({ status: "Error", message: "User not found" });
    }

    const user = cryptoUtils.decryptFields(rawUser, ["name", "surname"]);

    return res.status(200).send({ status: "Success", user });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getPublicUsersBatch(req, res) {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .send({ status: "Error", message: "ids must be a non-empty array" });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: ids.map(String) } },
      select: { id: true, name: true, surname: true, img_perfil: true },
    });

    const decryptedUsers = users.map((u) =>
      cryptoUtils.decryptFields(u, ["name", "surname"]),
    );

    return res.status(200).send({ status: "Success", users: decryptedUsers });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getPublicUserProfile(req, res) {
  try {
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
      return res
        .status(404)
        .send({ status: "Error", message: "User not found" });
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

    const bearerToken = req.headers.authorization?.split(" ")[1];
    const cookieToken = req.cookies?.access_token;
    const userToken = bearerToken || cookieToken;

    const driverStats = await trayectosService.getDriverStats(
      String(id),
      userToken,
    );

    return res.status(200).send({
      status: "Success",
      user: {
        ...publicFields,
        cars: user.cars,
        stats: {
          avg_rating: avgRating,
          total_comments: totalComments,
          events_joined: _count?.eventParticipations ?? 0,
          completed_trips: driverStats.completed_trips,
          kwh_generated: driverStats.kwh_generated,
          eur_generated: driverStats.eur_generated,
        },
        recent_comments: comments
          .sort((a, b) => b.id_comment.localeCompare(a.id_comment))
          .slice(0, 5),
      },
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

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
