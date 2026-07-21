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
} from "../middlewares/authorization.js";
dotenv.config();
const client_id = process.env.GOOGLE_CLIENT_ID;
const secret_id = process.env.GOOGLE_OAUTH;
const android_client_id = process.env.GOOGLE_CLIENT_ID_ANDROID;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const isProduction = process.env.NODE_ENV === "production";

async function createStripeAccountForUser(userId, email) {
  try {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      metadata: { userId },
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

async function login(req, res) {
  const result = UserSchemas.validateLogin(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
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
    return res.status(404).send({
      status: "Error",
      message:
        "No existe ninguna cuenta con este correo electrónico. ¿Te has registrado ya?",
    });
  }

  if (comprobarUser.auth_method !== authMethods.PASSWORD) {
    return res.status(400).send({
      status: "Error",
      message:
        "Esta cuenta fue creada con Google. Inicia sesión usando el botón de Google.",
    });
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    comprobarUser.password,
  );

  if (!isPasswordValid) {
    return res.status(401).send({
      status: "Error",
      message: "La contraseña introducida no es correcta. Inténtalo de nuevo.",
    });
  }

  const role = comprobarUser.role?.name ?? "user";
  const token = jsonwebtoken.sign(
    { userId: comprobarUser.id, email, role },
    PRIVATE_KEY,
    { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
  );

  res.cookie("access_token", token, buildAccessCookieOptions());
  await issueRefreshToken(res, comprobarUser.id);
  return res.status(200).send({
    status: "Success",
    message: `Login successful`,
    userId: comprobarUser.id,
    token,
    role,
    img_perfil: comprobarUser.img_perfil,
    onboarding_ended: comprobarUser.onboarding_ended,
  });
}

async function register(req, res) {
  console.log(req.body);
  const result = UserSchemas.validateRegisterSchema(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }
  console.log(req.body);

  const { email, password } = result.data;

  const comprobarUser = await prisma.user.findUnique({ where: { email } });

  if (comprobarUser) {
    return res.status(409).send({
      status: "Error",
      message:
        "Ya existe una cuenta registrada con este correo electrónico. Intenta iniciar sesión.",
    });
  }

  const hash = await utils.hashValue(10, password);

  const createdUser = await prisma.user.create({
    data: { email, password: hash, auth_method: authMethods.PASSWORD },
    include: { role: true },
  });

  const activeDefs = await prisma.preferenceDefinition.findMany({
    where: { is_active: true },
  });
  if (activeDefs.length > 0) {
    await prisma.userPreference.createMany({
      data: activeDefs.map((pd) => ({
        user_id: createdUser.id,
        pref_key: pd.pref_key,
        value: pd.default_value,
      })),
      skipDuplicates: true,
    });
  }

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
  return res.status(201).send({
    status: "Success",
    message: "User registered successfully",
    token,
    role,
    userId: createdUser?.id,
  });
}

async function oauthGoogle(req, res) {
  res.header("Access-Control-Allow-origin", `${process.env.ORIGIN}`);
  res.header("Referrer-Policy", "no-referrer-when-downgrade");
  // Example query: GET /api/auth/oauth/google?method=login
  // or: GET /api/auth/oauth/google?method=register
  const method = req.query.method;
  console.log("Entra");
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
      return res
        .status(400)
        .send({
          status: "Error",
          message: "Método no válido. Debe ser 'login' o 'register'.",
        });
  }
  const oauth2Client = new OAuth2Client(client_id, secret_id, redirectUrl);

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: "profile openid email",
    prompt: "consent",
  });
  res.status(200).json({ url: authorizeUrl });
}

async function oauthGoogleAndroid(req, res) {
  try {
    const { id_token, method } = req.body;

    if (!id_token) {
      return res
        .status(400)
        .send({
          status: "Error",
          message:
            "Falta el token de Google (id_token). No se puede verificar la identidad.",
        });
    }

    if (method !== "login" && method !== "register") {
      return res.status(400).send({
        status: "Error",
        message: "Método no válido. Debe ser 'login' o 'register'.",
      });
    }

    const oauth2Client = new OAuth2Client();
    let payload;
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: id_token,
        audience: [android_client_id, client_id].filter(Boolean),
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      return res
        .status(401)
        .send({
          status: "Error",
          message:
            "El token de Google no es válido o ha expirado. Cierra sesión en Google e inténtalo de nuevo.",
        });
    }

    if (!payload) {
      return res.status(401).send({
        status: "Error",
        message:
          "No se pudo obtener la información de tu cuenta de Google. Inténtalo de nuevo.",
      });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || "";
    const picture = payload.picture || "";

    if (!email) {
      return res
        .status(400)
        .send({
          status: "Error",
          message:
            "Tu cuenta de Google no tiene un correo asociado. Revisa la configuración de tu cuenta de Google.",
        });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { google_id: googleId }] },
      include: { role: true },
    });

    if (method === "register") {
      if (existingUser) {
        return res
          .status(409)
          .send({
            status: "Error",
            message:
              "Ya existe una cuenta con este correo electrónico. Intenta iniciar sesión con Google.",
          });
      }

      const { methods: dbUtils } = await import("../utils/db.js");
      const userResult = await dbUtils.createUser(
        { email, password: "", name },
        authMethods.GOOGLE,
        googleId,
      );

      if (userResult?.status !== "Success") {
        return res
          .status(500)
          .send({
            status: "Error",
            message:
              "No se pudo completar el registro. Inténtalo de nuevo más tarde.",
          });
      }

      const newUser = userResult.user;
      const role = newUser.role?.name ?? "user";
      const token = jsonwebtoken.sign(
        { userId: newUser.id, email, role },
        PRIVATE_KEY,
        { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
      );

      res.cookie("access_token", token, buildAccessCookieOptions());
      await issueRefreshToken(res, newUser.id);

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
        return res
          .status(404)
          .send({
            status: "Error",
            message:
              "No existe ninguna cuenta con este correo. ¿Te has registrado ya con Google?",
          });
      }

      if (existingUser.auth_method !== authMethods.GOOGLE) {
        return res.status(400).send({
          status: "Error",
          message:
            "Esta cuenta no fue creada con Google. Inicia sesión con tu correo y contraseña.",
        });
      }

      const role = existingUser.role?.name ?? "user";
      const token = jsonwebtoken.sign(
        { userId: existingUser.id, email, role },
        PRIVATE_KEY,
        { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
      );

      res.cookie("access_token", token, buildAccessCookieOptions());
      await issueRefreshToken(res, existingUser.id);

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
  } catch (error) {
    console.error("Error in Android OAuth:", error);
    return res.status(500).send({
      status: "Error",
      message: "Error al autenticar con Google. Inténtalo de nuevo más tarde.",
    });
  }
}

async function logout(req, res) {
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

  res.clearCookie("access_token", {
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
  });
  res.clearCookie("refresh_token", {
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
  });
  return res
    .status(200)
    .send({ status: "Success", message: "Logout successful" });
}

async function refresh(req, res) {
  try {
    const rawRefreshToken = req?.cookies?.refresh_token;
    if (!rawRefreshToken) {
      return res
        .status(401)
        .send({
          status: "Error",
          message: "No hay sesión activa. Inicia sesión de nuevo.",
        });
    }

    const hashedRefresh = crypto
      .createHash("sha256")
      .update(rawRefreshToken)
      .digest("hex");

    const stored = await prisma.refreshToken.findFirst({
      where: { token: hashedRefresh, revoked: false },
      select: { user_id: true, expires_at: true, revoked: true },
    });

    if (!stored) {
      res.clearCookie(
        "refresh_token",
        buildCookieOptions(new Date(), { httpOnly: true }),
      );
      return res
        .status(401)
        .send({
          status: "Error",
          message:
            "La sesión ha expirado o no es válida. Inicia sesión de nuevo.",
        });
    }

    const expiresAt = new Date(stored.expires_at);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      res.clearCookie(
        "refresh_token",
        buildCookieOptions(new Date(), { httpOnly: true }),
      );
      return res
        .status(401)
        .send({
          status: "Error",
          message:
            "Tu sesión ha expirado. Inicia sesión de nuevo para continuar.",
        });
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.user_id },
      include: { role: true },
    });

    if (!user) {
      res.clearCookie(
        "refresh_token",
        buildCookieOptions(new Date(), { httpOnly: true }),
      );
      return res
        .status(401)
        .send({
          status: "Error",
          message: "El usuario asociado a esta sesión ya no existe.",
        });
    }

    const role = user.role?.name ?? "user";
    // Rotate refresh token and issue new access token
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

    return res.status(200).send({
      status: "Success",
      message: "Token refreshed",
      token: accessToken,
      role,
      userId: user.id,
    });
  } catch (error) {
    res.clearCookie(
      "access_token",
      buildCookieOptions(new Date(), { httpOnly: true }),
    );
    res.clearCookie(
      "refresh_token",
      buildCookieOptions(new Date(), { httpOnly: true }),
    );
    return res
      .status(401)
      .send({
        status: "Error",
        message: "No se pudo renovar la sesión. Inicia sesión de nuevo.",
      });
  }
}

async function validate(req, res) {
  try {
    const rawHeader =
      req?.headers?.authorization || req?.headers?.authentication;
    let bearerToken = null;
    if (rawHeader && typeof rawHeader === "string") {
      const [scheme, tokenFromHeader] = rawHeader.split(" ");
      if (scheme?.toLowerCase() === "bearer" && tokenFromHeader) {
        bearerToken = tokenFromHeader;
      }
    }
    const cookieToken = req?.cookies?.access_token;
    if (!bearerToken && !cookieToken) {
      return res
        .status(401)
        .send({
          status: "Error",
          message: "No se ha proporcionado ningún token de autenticación.",
        });
    }

    const token = bearerToken || cookieToken;
    console.log(token);

    // Verificar explícitamente el token
    try {
      jsonwebtoken.verify(token, PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] });
    } catch (jwtError) {
      console.error("[validate] JWT error:", jwtError.name, jwtError.message);
      res.clearCookie("access_token", {
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
      });
      return res.status(401).send({
        status: "Error",
        message:
          "El token de acceso ha expirado o no es válido. Inicia sesión de nuevo.",
        detail: jwtError.name,
      });
    }

    const findUser =
      (await authorization.reviseBearer(req)) ||
      (await authorization.reviseCookie(req));

    if (!findUser) {
      res.clearCookie("access_token", {
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
      });
      return res
        .status(401)
        .send({
          status: "Error",
          message:
            "El usuario asociado a este token ya no existe en el sistema.",
        });
    }

    const user = {
      userId: findUser.id,
      email: findUser.email,
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
  } catch (error) {
    return res.status(401).send({
      status: "Error",
      message: "No se pudo verificar la autenticación. Inicia sesión de nuevo.",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

async function existEmail(req, res) {
  const { email } = req.query;
  const comprobarUser = await prisma.user.findUnique({ where: { email } });
  if (comprobarUser) {
    return res
      .status(409)
      .send({
        status: "Error",
        message: "Ya existe una cuenta registrada con este correo electrónico.",
      });
  }
  return res
    .status(200)
    .send({
      status: "Success",
      message: "Este correo electrónico está disponible.",
    });
}

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
};
