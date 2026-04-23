import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import database from "../database.js";
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

  await database.execute({
    sql: "DELETE FROM refresh_tokens WHERE user_id = ?",
    args: [userId],
  });

  await database.execute({
    sql: "INSERT INTO refresh_tokens (user_id, token, expires_at, revoked) VALUES (?, ?, ?, 0)",
    args: [userId, hashedToken, expiresAt.toISOString()],
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

  const { rows } = await database.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });
  const comprobarUser = cryptoUtils.decryptFields(
    rows[0],
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
  const result = UserSchemas.validateRegisterSchema(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const { email, password } = result.data;

  const { rows: userRows } = await database.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });
  const comprobarUser = userRows[0];

  if (comprobarUser) {
    return res
      .status(404)
      .send({ status: "Error", message: "User already created" });
  }

  const hash = await utils.hashValue(10, password);

  const { rows: emailRows } = await database.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });
  if (emailRows.length > 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "Email already exists" });
  }
  const insertResult = await database.execute({
    sql: "INSERT INTO users (email, password, auth_method) VALUES (?, ?, ?)",
    args: [email, hash, authMethods.PASSWORD],
  });

  if (insertResult.rowsAffected === 0) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to register user" });
  }

  const { rows: createdRows } = await database.execute({
    sql: "SELECT id, email FROM users WHERE email = ?",
    args: [email],
  });

  const createdUser = createdRows?.[0];

  await database.execute({
    sql: `INSERT OR IGNORE INTO user_preferences (user_id, pref_key, value)
          SELECT ?, pd.pref_key, pd.default_value
          FROM preference_definitions pd
          WHERE pd.is_active = 1`,
    args: [createdUser?.id],
  });

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

async function logout(req, res) {
  res.clearCookie("access_token", {
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

    const { rows } = await database.execute({
      sql: "SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token = ? LIMIT 1",
      args: [hashedRefresh],
    });

    const stored = rows?.[0];

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

    const { rows: userRows } = await database.execute({
      sql: "SELECT id, email FROM users WHERE id = ? LIMIT 1",
      args: [stored.user_id],
    });
    const user = userRows?.[0];

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

    // Verificar explícitamente el token
    try {
      jsonwebtoken.verify(token, process.env.JWT_SECRET_KEY);
    } catch (jwtError) {
      res.clearCookie("access_token", {
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
      });
      return res.status(401).send({
        status: "Error",
        message: "Invalid or expired token",
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
  const { rows: emailCheckRows } = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });
  const comprobarUser = emailCheckRows[0];
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
  logout,
  refresh,
  validate,
  existEmail,
  issueRefreshToken,
};
