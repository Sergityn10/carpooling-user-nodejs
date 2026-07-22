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
  const result = UserSchemas.validateUserSchemaPartial(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  console.log(result);

  const { id } = req.params;

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = req.user ?? (await authorization.reviseCookie(req));
  if (!findUser || String(findUser.id) !== String(id)) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }

  if (result.data.password) {
    result.data.password = await utils.hashValue(10, result.data.password);
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, dni: true },
      where: { dni: { not: null } },
    });
    const collision = allUsers.find((r) => {
      if (!r?.dni) return false;
      const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
      return plain === dniCandidate && String(r.id) !== String(id);
    });
    if (collision) {
      return res
        .status(409)
        .send({ status: "Error", message: "DNI already exists" });
    }
  }

  const updatesEncrypted = cryptoUtils.encryptFields(
    result.data,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  const keys = Object.keys(updatesEncrypted);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
  }

  await prisma.user.update({ where: { id }, data: updatesEncrypted });

  paymentServices
    .updateStripeAccountFromProfile(id, result.data)
    .catch((err) =>
      console.error("[updateUserPatch] Error sincronizando con Stripe:", err),
    );

  return res
    .status(200)
    .send({ status: "Success", message: "User updated successfully" });
}

async function updateMyUserPatch(req, res) {
  const result = UserSchemas.validateUserSchemaPartial(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = req.user;
  console.log(result);

  if (result.data.password) {
    result.data.password = await utils.hashValue(10, result.data.password);
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    const allUsers = await prisma.user.findMany({
      select: { email: true, dni: true },
      where: { dni: { not: null } },
    });
    const collision = allUsers.find((r) => {
      if (!r?.dni) return false;
      const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
      return (
        plain === dniCandidate && String(r.email) !== String(findUser.email)
      );
    });
    if (collision) {
      return res
        .status(409)
        .send({ status: "Error", message: "DNI already exists" });
    }
  }

  const updatesEncrypted = cryptoUtils.encryptFields(
    result.data,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  const keys = Object.keys(updatesEncrypted);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
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

  return res
    .status(200)
    .send({ status: "Success", message: "User updated successfully" });
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
async function getMyUserInfo(req, res) {
  const findUser = req.user;

  const [receivedComments, givenComments, userPreferences] = await Promise.all([
    prisma.comment.findMany({ where: { user_id_trayect: findUser.id } }),
    prisma.comment.findMany({ where: { user_id_commentator: findUser.id } }),
    prisma.userPreference.findMany({
      where: { user_id: findUser.id },
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
    viajes = await countUserViajes(findUser.id);
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
      name: findUser.name,
      surname: findUser.surname,
      phone: findUser.phone,
      email: findUser.email,
      img_perfil: findUser.img_perfil,
      role: findUser.role?.name ?? "user",
      fecha_nacimiento: findUser.fecha_nacimiento,
      genero: findUser.genero,
      averageRating,
      numOpinions,
      myNumOpinions: givenComments.length,
      about_me: findUser.about_me,
      viajes,
      preferences,
    },
  });
}

async function getPublicUserInfo(req, res) {
  try {
    const { id } = req.params;
    const rawUser = await prisma.user.findUnique({
      where: { id: String(id) },
      select: { id: true, name: true, img_perfil: true },
    });

    if (!rawUser) {
      return res
        .status(404)
        .send({ status: "Error", message: "User not found" });
    }

    const user = cryptoUtils.decryptFields(rawUser, ["name"]);

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
      select: { id: true, name: true, img_perfil: true },
    });

    const decryptedUsers = users.map((u) =>
      cryptoUtils.decryptFields(u, ["name"]),
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
