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
dotenv.config();
const client_id = process.env.GOOGLE_CLIENT_ID;
const secret_id = process.env.GOOGLE_OAUTH;
const android_client_id = process.env.GOOGLE_CLIENT_ID_ANDROID;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const isProduction = process.env.NODE_ENV === "production";
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_COOKIE_DAYS = Number(process.env.JWT_COOKIES_EXPIRATION_TIME || 1);

function buildCookieOptions(expiresAt, { httpOnly = true } = {}) {
  const maxAge = expiresAt.getTime() - Date.now();
  return {
    httpOnly,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    expires: expiresAt,
    maxAge,
  };
}

function buildAccessCookieOptions() {
  const expiresAt = new Date(Date.now() + ACCESS_COOKIE_DAYS * 60 * 1000);
  return buildCookieOptions(expiresAt);
}

async function persistRefreshToken(userId, rawToken, expiresAt) {
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  await prisma.refreshToken.deleteMany({ where: { user_id: userId } });

  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token: hashedToken,
      expires_at: expiresAt,
      revoked: false,
    },
  });
}

async function issueRefreshToken(res, userId) {
  const rawToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + ONE_MONTH_MS);

  await persistRefreshToken(userId, rawToken, expiresAt);
  res.cookie("refresh_token", rawToken, buildCookieOptions(expiresAt));
}

async function login(req, res) {
  const result = UserSchemas.validateLogin(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const { email, password } = result.data;

  const rawUser = await prisma.user.findUnique({ where: { email } });
  const comprobarUser = cryptoUtils.decryptFields(
    rawUser,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  if (!comprobarUser) {
    return res.status(404).send({ status: "Error", message: "Login failed" });
  }

  if (comprobarUser.auth_method !== authMethods.PASSWORD) {
    return res
      .status(404)
      .send({ status: "Error", message: "Authentication method no valid" });
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    comprobarUser.password,
  );

  if (!isPasswordValid) {
    return res.status(404).send({ status: "Error", message: "Login failed" });
  }

  const token = jsonwebtoken.sign(
    { userId: comprobarUser.id, email },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.EXPIRATION_TIME },
  );

  res.cookie("access_token", token, buildAccessCookieOptions());
  await issueRefreshToken(res, comprobarUser.id);
  return res.status(200).send({
    status: "Success",
    message: `Login successful`,
    userId: comprobarUser.id,
    token,
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
    return res
      .status(404)
      .send({ status: "Error", message: "User already created" });
  }

  const hash = await utils.hashValue(10, password);

  const createdUser = await prisma.user.create({
    data: { email, password: hash, auth_method: authMethods.PASSWORD },
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

  const token = jsonwebtoken.sign(
    { userId: createdUser?.id, email },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.EXPIRATION_TIME },
  );

  res.cookie("access_token", token, buildAccessCookieOptions());
  await issueRefreshToken(res, createdUser?.id);
  return res.status(201).send({
    status: "Success",
    message: "User registered successfully",
    token,
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
        .send({ status: "Error", message: "Invalid method" });
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
        .send({ status: "Error", message: "id_token is required" });
    }

    if (method !== "login" && method !== "register") {
      return res.status(400).send({
        status: "Error",
        message: "Invalid method, must be 'login' or 'register'",
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
        .send({ status: "Error", message: "Invalid Google id_token" });
    }

    if (!payload) {
      return res.status(401).send({
        status: "Error",
        message: "Failed to extract payload from id_token",
      });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || "";
    const picture = payload.picture || "";

    if (!email) {
      return res
        .status(400)
        .send({ status: "Error", message: "Google account has no email" });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { google_id: googleId }] },
    });

    if (method === "register") {
      if (existingUser) {
        return res
          .status(409)
          .send({ status: "Error", message: "User already exists" });
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
          .send({ status: "Error", message: "Failed to register user" });
      }

      const newUser = userResult.user;
      const token = jsonwebtoken.sign(
        { userId: newUser.id, email },
        process.env.JWT_SECRET_KEY,
        { expiresIn: process.env.EXPIRATION_TIME },
      );

      res.cookie("access_token", token, buildAccessCookieOptions());
      await issueRefreshToken(res, newUser.id);

      return res.status(201).send({
        status: "Success",
        message: "User registered successfully",
        token,
        userId: newUser.id,
        img_perfil: picture,
        onboarding_ended: 0,
      });
    }

    if (method === "login") {
      if (!existingUser) {
        return res
          .status(404)
          .send({ status: "Error", message: "User not found" });
      }

      if (existingUser.auth_method !== authMethods.GOOGLE) {
        return res.status(404).send({
          status: "Error",
          message: "Authentication method not valid",
        });
      }

      const token = jsonwebtoken.sign(
        { userId: existingUser.id, email },
        process.env.JWT_SECRET_KEY,
        { expiresIn: process.env.EXPIRATION_TIME },
      );

      res.cookie("access_token", token, buildAccessCookieOptions());
      await issueRefreshToken(res, existingUser.id);

      return res.status(200).send({
        status: "Success",
        message: "Login successful",
        token,
        userId: existingUser.id,
        img_perfil: existingUser.img_perfil || picture,
        onboarding_ended: existingUser.onboarding_ended,
      });
    }
  } catch (error) {
    console.error("Error in Android OAuth:", error);
    return res.status(500).send({
      status: "Error",
      message: "Android OAuth authentication failed",
    });
  }
}

async function logout(req, res) {
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
        .send({ status: "Error", message: "No refresh token provided" });
    }

    const hashedRefresh = crypto
      .createHash("sha256")
      .update(rawRefreshToken)
      .digest("hex");

    const stored = await prisma.refreshToken.findFirst({
      where: { token: hashedRefresh },
      select: { user_id: true, expires_at: true, revoked: true },
    });

    if (!stored || stored.revoked) {
      res.clearCookie(
        "refresh_token",
        buildCookieOptions(new Date(), { httpOnly: true }),
      );
      return res
        .status(401)
        .send({ status: "Error", message: "Refresh token invalid" });
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
        .send({ status: "Error", message: "Refresh token expired" });
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.user_id },
      select: { id: true, email: true },
    });

    if (!user) {
      res.clearCookie(
        "refresh_token",
        buildCookieOptions(new Date(), { httpOnly: true }),
      );
      return res
        .status(401)
        .send({ status: "Error", message: "User not found" });
    }

    // Rotate refresh token and issue new access token
    const accessToken = jsonwebtoken.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET_KEY,
      { expiresIn: process.env.EXPIRATION_TIME },
    );

    res.cookie("access_token", accessToken, buildAccessCookieOptions());
    await issueRefreshToken(res, user.id);

    return res.status(200).send({
      status: "Success",
      message: "Token refreshed",
      token: accessToken,
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
    return res.status(401).send({ status: "Error", message: "Invalid token" });
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
        .send({ status: "Error", message: "No authentication token provided" });
    }

    const token = bearerToken || cookieToken;
    console.log(token);

    // Verificar explícitamente el token
    try {
      jsonwebtoken.verify(token, process.env.JWT_SECRET_KEY);
    } catch (jwtError) {
      console.error("[validate] JWT error:", jwtError.name, jwtError.message);
      res.clearCookie("access_token", {
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
      });
      return res.status(401).send({
        status: "Error",
        message: "Invalid or expired token",
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
        .send({ status: "Error", message: "User not found for this token" });
    }

    const user = {
      userId: findUser.id,
      email: findUser.email,
      img_perfil: findUser.img_perfil,
      ciudad: findUser.ciudad,
      onboarding_ended: findUser.onboarding_ended,
      role: findUser.role,
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
      message: "Authentication failed",
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
      .status(404)
      .send({ status: "Error", message: "Email already exists" });
  }
  return res
    .status(200)
    .send({ status: "Success", message: "Email not exists" });
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
