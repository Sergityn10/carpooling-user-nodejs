import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
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

  const cookiesOptions = {
    expires: new Date(
      Date.now() +
      process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
    ), // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
    maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
  };

  res.cookie("access_token", token, cookiesOptions);
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

  const { email, password, name } = result.data;

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

  const encryptedUserFields = cryptoUtils.encryptFields(
    { name },
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  const { rows: emailRows } = await database.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });
  if (emailRows.length > 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "Email already exists" });
  }
  const customer_account = await stripe.customers.create({
    name: name,
    individual_name: name,
    email: email,
  });

  const insertResult = await database.execute({
    sql: "INSERT INTO users (email, password, name, auth_method, stripe_customer_account) VALUES (?, ?, ?, ?, ?)",
    args: [
      email,
      hash,
      encryptedUserFields.name,
      authMethods.PASSWORD,
      customer_account.id,
    ],
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

  const token = jsonwebtoken.sign(
    { userId: createdUser?.id, email },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.EXPIRATION_TIME },
  );

  const cookiesOptions = {
    expires: new Date(
      Date.now() +
      process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
    ), // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
    maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
  };

  res.cookie("access_token", token, cookiesOptions);
  await fetch(
    `${process.env.TRAYECTOS_ORIGIN || "http://localhost:3000"}/api/users/${createdUser?.id}/preferences/default`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
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
    const token = bearerToken || cookieToken;
    if (!token) {
      return res
        .status(401)
        .send({ status: "Error", message: "No token provided" });
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
        .send({ status: "Error", message: "Invalid token" });
    }

    const newToken = jsonwebtoken.sign(
      { userId: findUser.id, email: findUser.email },
      process.env.JWT_SECRET_KEY,
      { expiresIn: process.env.EXPIRATION_TIME },
    );

    res.cookie("access_token", newToken, {
      expires: new Date(
        Date.now() +
        process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      path: "/",
      maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
    });

    return res.status(200).send({
      status: "Success",
      message: "Token refreshed",
      token: newToken,
      userId: findUser.id,
    });
  } catch (error) {
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
        message: "Invalid or expired token"
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
      details: process.env.NODE_ENV === "development" ? error.message : undefined
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
};
