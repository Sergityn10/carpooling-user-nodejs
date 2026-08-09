import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { schemas } from "../schemas.js";
import { UserSchemas } from "../schemas/user.js";
import { TelegramInfo } from "../schemas/Telegram/telegramInfo.js";
import { TelegramInfoServices } from "./telegramInfo.js";
import { authorization } from "../middlewares/authorization.js";
import { methods as utils } from "../utils/hashing.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import Stripe from "stripe";
import { OAuth2Client } from "google-auth-library";
import { authMethods } from "../schemas/auth_methods.js";
import { methods as paymentServices } from "./payment.js";
import { PRIVATE_KEY, PUBLIC_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";
import {
  buildCookieOptions,
  buildAccessCookieOptions,
  issueRefreshToken,
  clearAccessCookie,
  clearRefreshCookie,
} from "../middlewares/authorization.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { eventBus } from "../services/eventBus.js";
dotenv.config();
const client_id = process.env.GOOGLE_CLIENT_ID;
const secret_id = process.env.GOOGLE_OAUTH;
const android_client_id = process.env.GOOGLE_CLIENT_ID_ANDROID;
const extra_client_ids = (process.env.GOOGLE_CLIENT_ID_EXTRA ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const isProduction = process.env.NODE_ENV === "production";

function validateConsents(consents) {
  if (!consents) {
    return {
      valid: false,
      error:
        "Debes aceptar la Política de Privacidad y los Términos de Servicio para registrarte.",
    };
  }
  if (
    !consents.privacy_policy_accepted ||
    !consents.terms_of_service_accepted
  ) {
    return {
      valid: false,
      error:
        "Debes aceptar la Política de Privacidad y los Términos de Servicio para registrarte.",
    };
  }
  return { valid: true };
}

function buildConsentRecords(userId, consents, ipAddress, userAgent) {
  const records = [];
  if (consents.privacy_policy_accepted) {
    records.push({
      userId,
      documentType: "PRIVACY_POLICY",
      documentVersion: consents.privacy_version || "v1.0",
      ipAddress,
      userAgent,
    });
  }
  if (consents.terms_of_service_accepted) {
    records.push({
      userId,
      documentType: "TERMS_OF_SERVICE",
      documentVersion: consents.terms_version || "v1.0",
      ipAddress,
      userAgent,
    });
  }
  if (consents.marketing_accepted) {
    records.push({
      userId,
      documentType: "MARKETING",
      documentVersion: "v1.0",
      ipAddress,
      userAgent,
    });
  }
  return records;
}

async function saveLegalConsents(userId, consents, ipAddress, userAgent) {
  if (!consents) return;
  const records = buildConsentRecords(userId, consents, ipAddress, userAgent);
  if (records.length > 0) {
    await prisma.legalConsent.createMany({ data: records });
  }
}

async function createStripeAccountForUser(userId, email) {
  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: "ES",
      email,
      business_type: "individual",
      business_profile: {
        mcc: "4121",
        product_description:
          "Conductor de carpooling en la plataforma YouConnext",
        url: "https://carpooling-webapp-ten.vercel.app",
      },
      metadata: { userId },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    await prisma.account.create({
      data: {
        stripe_account_id: account.id,
        user_id: userId,
        charges_enabled: account.charges_enabled ?? false,
        transfers_enabled:
          String(account.capabilities?.transfers ?? "").toLowerCase() ===
          "active",
        details_submitted: account.details_submitted ?? false,
      },
    });

    return account.id;
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    return null;
  }
}

const login = catchAsync(async (req, res, next) => {
  const result = UserSchemas.validateLogin(req.body);
  if (!result.success) {
    return next(
      new AppError(
        "Los datos proporcionados no son válidos.",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const { email, password } = result.data;

  const rawUser = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  const comprobarUser = cryptoUtils.decryptFields(
    rawUser,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  if (!comprobarUser) {
    return next(
      new AppError(
        "No existe ninguna cuenta con este correo electrónico. ¿Te has registrado ya?",
        404,
        "EMAIL_NOT_REGISTERED",
      ),
    );
  }

  if (comprobarUser.auth_method !== authMethods.PASSWORD) {
    return next(
      new AppError(
        "Esta cuenta fue creada con Google. Inicia sesión usando el botón de Google.",
        400,
        "WRONG_AUTH_METHOD",
      ),
    );
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    comprobarUser.password,
  );

  if (!isPasswordValid) {
    return next(
      new AppError(
        "La contraseña introducida no es correcta. Inténtalo de nuevo.",
        401,
        "INVALID_CREDENTIALS",
      ),
    );
  }

  const role = comprobarUser.role?.name ?? "user";
  const token = jsonwebtoken.sign(
    { userId: comprobarUser.id, email, role },
    PRIVATE_KEY,
    { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
  );

  res.cookie("access_token", token, buildAccessCookieOptions());
  await issueRefreshToken(res, comprobarUser.id);
  await eventBus.userLogin(comprobarUser.id, email, role);
  return res.status(200).send({
    status: "Success",
    message: `Login successful`,
    userId: comprobarUser.id,
    token,
    role,
    img_perfil: comprobarUser.img_perfil,
    onboarding_ended: comprobarUser.onboarding_ended,
  });
});

const register = catchAsync(async (req, res, next) => {
  const result = UserSchemas.validateRegisterSchema(req.body);
  if (!result.success) {
    return next(
      new AppError(
        "Los datos proporcionados no son válidos.",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const { email, password, consents } = result.data;

  const consentCheck = validateConsents(consents);
  console.log(consents);
  if (!consentCheck.valid) {
    return next(new AppError(consentCheck.error, 400, "CONSENTS_REQUIRED"));
  }

  const comprobarUser = await prisma.user.findUnique({ where: { email } });

  if (comprobarUser) {
    return next(
      new AppError(
        "Ya existe una cuenta registrada con este correo electrónico. Intenta iniciar sesión.",
        409,
        "EMAIL_ALREADY_REGISTERED",
      ),
    );
  }

  const hash = await utils.hashValue(10, password);

  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, password: hash, auth_method: authMethods.PASSWORD },
      include: { role: true },
    });

    const activeDefs = await tx.preferenceDefinition.findMany({
      where: { is_active: true },
    });
    if (activeDefs.length > 0) {
      await tx.userPreference.createMany({
        data: activeDefs.map((pd) => ({
          user_id: user.id,
          pref_key: pd.pref_key,
          value: pd.default_value,
        })),
        skipDuplicates: true,
      });
    }

    if (consents) {
      const consentRecords = buildConsentRecords(
        user.id,
        consents,
        ipAddress,
        userAgent,
      );
      if (consentRecords.length > 0) {
        await tx.legalConsent.createMany({ data: consentRecords });
      }
    }

    return user;
  });

  const stripeAccountId = await paymentServices.createStripeAccountForUserEmpty(
    createdUser.id,
    email,
    result.data.name || "",
  );
  if (stripeAccountId) {
    await prisma.user.update({
      where: { id: createdUser.id },
      data: { stripe_account: stripeAccountId },
    });
  }

  const role = createdUser?.role?.name ?? "user";
  const token = jsonwebtoken.sign(
    { userId: createdUser?.id, email, role },
    PRIVATE_KEY,
    { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
  );

  res.cookie("access_token", token, buildAccessCookieOptions());
  await issueRefreshToken(res, createdUser?.id);
  await eventBus.userRegistered(
    createdUser?.id,
    email,
    authMethods.PASSWORD,
    role,
  );
  return res.status(201).send({
    status: "Success",
    message: "User registered successfully",
    token,
    role,
    userId: createdUser?.id,
  });
});

const oauthGoogle = catchAsync(async (req, res, next) => {
  res.header("Access-Control-Allow-origin", `${process.env.ORIGIN}`);
  res.header("Referrer-Policy", "no-referrer-when-downgrade");
  const method = req.query.method;
  let redirectUrl;
  let origin = process.env.MY_ORIGIN;
  switch (method) {
    case "login":
      redirectUrl = `${origin}api/auth/oauth/login`;
      break;
    case "register":
      redirectUrl = `${origin}api/auth/oauth/register`;
      break;
    default:
      return next(
        new AppError(
          "Método no válido. Debe ser 'login' o 'register'.",
          400,
          "INVALID_OAUTH_METHOD",
        ),
      );
  }

  let state = undefined;
  if (method === "register") {
    const consents = req.body?.consents || req.query.consents;
    const consentCheck = validateConsents(consents);
    if (!consentCheck.valid) {
      return next(new AppError(consentCheck.error, 400, "CONSENTS_REQUIRED"));
    }
    state = Buffer.from(JSON.stringify(consents)).toString("base64");
  }

  const oauth2Client = new OAuth2Client(client_id, secret_id, redirectUrl);

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: "profile openid email",
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  res.status(200).json({ url: authorizeUrl });
});

const oauthGoogleAndroid = catchAsync(async (req, res, next) => {
  const { id_token, method, consents } = req.body;

  if (!id_token) {
    return next(
      new AppError(
        "Falta el token de Google (id_token). No se puede verificar la identidad.",
        400,
        "GOOGLE_TOKEN_MISSING",
      ),
    );
  }

  if (method !== "login" && method !== "register") {
    return next(
      new AppError(
        "Método no válido. Debe ser 'login' o 'register'.",
        400,
        "INVALID_OAUTH_METHOD",
      ),
    );
  }

  const oauth2Client = new OAuth2Client();
  let payload;
  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: id_token,
      audience: [android_client_id, client_id, ...extra_client_ids].filter(
        Boolean,
      ),
    });
    payload = ticket.getPayload();
  } catch (verifyError) {
    let tokenAud;
    try {
      const decoded = JSON.parse(
        Buffer.from(id_token.split(".")[1], "base64").toString("utf-8"),
      );
      tokenAud = decoded.aud;
    } catch (_e) {}
    console.error("Google token verification failed:", {
      message: verifyError?.message,
      tokenAud,
      configuredAudience: [android_client_id, client_id].filter(Boolean),
    });
    return next(
      new AppError(
        "El token de Google no es válido o ha expirado. Cierra sesión en Google e inténtalo de nuevo.",
        401,
        "GOOGLE_TOKEN_INVALID",
      ),
    );
  }

  if (!payload) {
    return next(
      new AppError(
        "No se pudo obtener la información de tu cuenta de Google. Inténtalo de nuevo.",
        401,
        "GOOGLE_PAYLOAD_MISSING",
      ),
    );
  }

  const googleId = payload.sub;
  const email = payload.email;
  const name = payload.name || "";
  const picture = payload.picture || "";

  if (!email) {
    return next(
      new AppError(
        "Tu cuenta de Google no tiene un correo asociado. Revisa la configuración de tu cuenta de Google.",
        400,
        "GOOGLE_NO_EMAIL",
      ),
    );
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { google_id: googleId }] },
    include: { role: true },
  });

  if (method === "register") {
    if (existingUser) {
      return next(
        new AppError(
          "Ya existe una cuenta con este correo electrónico. Intenta iniciar sesión con Google.",
          409,
          "EMAIL_ALREADY_REGISTERED",
        ),
      );
    }

    const consentCheck = validateConsents(consents);
    if (!consentCheck.valid) {
      return next(new AppError(consentCheck.error, 400, "CONSENTS_REQUIRED"));
    }

    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;

    const { methods: dbUtils } = await import("../utils/db.js");
    const userResult = await dbUtils.createUser(
      { email, password: "", name },
      authMethods.GOOGLE,
      googleId,
    );

    if (userResult?.status !== "Success") {
      return next(
        new AppError(
          "No se pudo completar el registro. Inténtalo de nuevo más tarde.",
          500,
          "REGISTRATION_FAILED",
        ),
      );
    }

    const newUser = userResult.user;

    await saveLegalConsents(newUser.id, consents, ipAddress, userAgent);
    const role = newUser.role?.name ?? "user";
    const token = jsonwebtoken.sign(
      { userId: newUser.id, email, role },
      PRIVATE_KEY,
      { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
    );

    res.cookie("access_token", token, buildAccessCookieOptions());
    await issueRefreshToken(res, newUser.id);
    await eventBus.userRegistered(newUser.id, email, authMethods.GOOGLE, role);

    return res.status(201).send({
      status: "Success",
      message: "User registered successfully",
      token,
      role,
      userId: newUser.id,
      img_perfil: picture,
      onboarding_ended: 0,
    });
  }

  if (method === "login") {
    if (!existingUser) {
      return next(
        new AppError(
          "No existe ninguna cuenta con este correo. ¿Te has registrado ya con Google?",
          404,
          "EMAIL_NOT_REGISTERED",
        ),
      );
    }

    if (existingUser.auth_method !== authMethods.GOOGLE) {
      return next(
        new AppError(
          "Esta cuenta no fue creada con Google. Inicia sesión con tu correo y contraseña.",
          400,
          "WRONG_AUTH_METHOD",
        ),
      );
    }

    const role = existingUser.role?.name ?? "user";
    const token = jsonwebtoken.sign(
      { userId: existingUser.id, email, role },
      PRIVATE_KEY,
      { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
    );

    res.cookie("access_token", token, buildAccessCookieOptions());
    await issueRefreshToken(res, existingUser.id);
    await eventBus.userLogin(existingUser.id, email, role);

    return res.status(200).send({
      status: "Success",
      message: "Login successful",
      token,
      role,
      userId: existingUser.id,
      img_perfil: existingUser.img_perfil || picture,
      onboarding_ended: existingUser.onboarding_ended,
    });
  }
});

const logout = catchAsync(async (req, res, next) => {
  const rawRefreshToken = req?.cookies?.refresh_token;

  if (rawRefreshToken) {
    try {
      const hashedRefresh = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");

      await prisma.refreshToken.updateMany({
        where: { token: hashedRefresh, revoked: false },
        data: { revoked: true },
      });
    } catch (err) {
      console.error(
        "[auth] logout: error revoking refresh token:",
        err?.message ?? err,
      );
    }
  }

  clearAccessCookie(res);
  clearRefreshCookie(res);
  return res
    .status(200)
    .send({ status: "Success", message: "Logout successful" });
});

const refresh = catchAsync(async (req, res, next) => {
  const rawRefreshToken = req?.cookies?.refresh_token;
  console.log("[refresh] Cookie refresh_token:", rawRefreshToken);
  if (!rawRefreshToken) {
    return next(
      new AppError(
        "No hay sesión activa. Inicia sesión de nuevo.",
        401,
        "NO_REFRESH_TOKEN",
      ),
    );
  }

  const hashedRefresh = crypto
    .createHash("sha256")
    .update(rawRefreshToken)
    .digest("hex");
  console.log("[refresh] Hashed refresh token:", hashedRefresh);

  const stored = await prisma.refreshToken.findFirst({
    where: { token: hashedRefresh, revoked: false },
    select: { user_id: true, expires_at: true, revoked: true },
  });
  console.log("[refresh] Stored token record:", stored);

  if (!stored) {
    clearRefreshCookie(res);
    return next(
      new AppError(
        "La sesión ha expirado o no es válida. Inicia sesión de nuevo.",
        401,
        "REFRESH_TOKEN_INVALID",
      ),
    );
  }

  const expiresAt = new Date(stored.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    clearRefreshCookie(res);
    return next(
      new AppError(
        "Tu sesión ha expirado. Inicia sesión de nuevo para continuar.",
        401,
        "REFRESH_TOKEN_EXPIRED",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: stored.user_id },
    include: { role: true },
  });

  if (!user) {
    clearRefreshCookie(res);
    return next(
      new AppError(
        "El usuario asociado a esta sesión ya no existe.",
        401,
        "TOKEN_USER_NOT_FOUND",
      ),
    );
  }

  const role = user.role?.name ?? "user";
  const accessToken = jsonwebtoken.sign(
    { userId: user.id, email: user.email, role },
    PRIVATE_KEY,
    { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
  );

  res.cookie("access_token", accessToken, buildAccessCookieOptions());
  await issueRefreshToken(res, user.id, {
    rotate: true,
    oldTokenHash: hashedRefresh,
  });
  console.log("[refresh] New access token:", accessToken);
  console.log("[refresh] User:", user.id, "Role:", role);

  return res.status(200).send({
    status: "Success",
    message: "Token refreshed",
    token: accessToken,
    role,
    userId: user.id,
  });
});

const validate = catchAsync(async (req, res, next) => {
  const rawHeader = req?.headers?.authorization || req?.headers?.authentication;
  let bearerToken = null;
  if (rawHeader && typeof rawHeader === "string") {
    const [scheme, tokenFromHeader] = rawHeader.split(" ");
    if (scheme?.toLowerCase() === "bearer" && tokenFromHeader) {
      bearerToken = tokenFromHeader;
    }
  }
  const cookieToken = req?.cookies?.access_token;
  if (!bearerToken && !cookieToken) {
    return next(
      new AppError(
        "No se ha proporcionado ningún token de autenticación.",
        401,
        "TOKEN_MISSING",
      ),
    );
  }

  const token = bearerToken || cookieToken;

  try {
    jsonwebtoken.verify(token, PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] });
  } catch (jwtError) {
    console.error("[validate] JWT error:", jwtError.name, jwtError.message);
    clearAccessCookie(res);
    return next(
      new AppError(
        "El token de acceso ha expirado o no es válido. Inicia sesión de nuevo.",
        401,
        "TOKEN_EXPIRED",
      ),
    );
  }

  const findUser =
    (await authorization.reviseBearer(req)) ||
    (await authorization.reviseCookie(req));

  if (!findUser) {
    clearAccessCookie(res);
    return next(
      new AppError(
        "El usuario asociado a este token ya no existe en el sistema.",
        401,
        "TOKEN_USER_NOT_FOUND",
      ),
    );
  }

  const user = {
    userId: findUser.id,
    email: findUser.email,
    name: findUser.name,
    surname: findUser.surname,
    img_perfil: findUser.img_perfil,
    ciudad: findUser.ciudad,
    onboarding_ended: findUser.onboarding_ended,
    role: findUser.role?.name ?? "user",
  };
  return res.status(200).send({
    status: "Success",
    message: "Token is valid",
    token,
    data: user,
  });
});

const existEmail = catchAsync(async (req, res, next) => {
  const { email } = req.query;
  const comprobarUser = await prisma.user.findUnique({ where: { email } });
  if (comprobarUser) {
    return next(
      new AppError(
        "Ya existe una cuenta registrada con este correo electrónico.",
        409,
        "EMAIL_ALREADY_REGISTERED",
      ),
    );
  }
  return res.status(200).send({
    status: "Success",
    message: "Este correo electrónico está disponible.",
  });
});

export const methods = {
  login,
  register,
  oauthGoogle,
  oauthGoogleAndroid,
  logout,
  refresh,
  validate,
  existEmail,
  issueRefreshToken,
  validateConsents,
  saveLegalConsents,
};
