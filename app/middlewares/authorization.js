import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
dotenv.config();

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_COOKIE_DAYS = Number(process.env.JWT_COOKIES_EXPIRATION_TIME || 1);
const isProduction = process.env.NODE_ENV === "production";

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

async function tryRefreshAccessToken(req, res) {
  try {
    const rawRefreshToken = req?.cookies?.refresh_token;
    if (!rawRefreshToken) return null;

    const hashedRefresh = crypto
      .createHash("sha256")
      .update(rawRefreshToken)
      .digest("hex");

    const stored = await prisma.refreshToken.findFirst({
      where: { token: hashedRefresh },
      select: { id: true, user_id: true, expires_at: true, revoked: true },
    });

    if (!stored || stored.revoked) {
      if (res?.clearCookie) {
        res.clearCookie("refresh_token", {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          path: "/",
        });
      }
      return null;
    }

    const expiresAt = new Date(stored.expires_at);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      if (res?.clearCookie) {
        res.clearCookie("refresh_token", {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          path: "/",
        });
      }
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.user_id },
    });

    if (!user) {
      if (res?.clearCookie) {
        res.clearCookie("refresh_token", {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          path: "/",
        });
      }
      return null;
    }

    const accessToken = jsonwebtoken.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET_KEY,
      { expiresIn: process.env.EXPIRATION_TIME },
    );

    if (res?.cookie) {
      res.cookie("access_token", accessToken, buildAccessCookieOptions());
    }
    await issueRefreshToken(res, user.id);

    return cryptoUtils.decryptFields(user, cryptoUtils.USER_SENSITIVE_FIELDS);
  } catch (error) {
    console.error("Error in tryRefreshAccessToken:", error);
    return null;
  }
}

async function isLoged(req, res, next) {
  let logueado;
  let expired = false;
  try {
    logueado = (await reviseBearer(req)) || (await reviseCookie(req));
  } catch (e) {
    if (e.isExpired) {
      expired = true;
    } else {
      return res.status(403).send({
        status: "Error",
        message: `Access denied. ${e.message}`,
      });
    }
  }

  if (!logueado && expired) {
    logueado = await tryRefreshAccessToken(req, res);
  }

  if (!logueado) {
    return res.status(403).send({ status: "Error", message: "Access denied." });
  }

  req.user = logueado;
  next();
}

async function onlyAdmin(req, res, next) {
  let logueado;
  let expired = false;
  try {
    logueado = (await reviseBearer(req)) || (await reviseCookie(req));
  } catch (e) {
    if (e.isExpired) {
      expired = true;
    } else {
      return res
        .status(403)
        .send({ status: "Error", message: "Access denied. Admins only." });
    }
  }

  if (!logueado && expired) {
    logueado = await tryRefreshAccessToken(req, res);
  }

  if (!logueado) {
    return res
      .status(403)
      .send({ status: "Error", message: "Access denied. Admins only." });
  }

  if (logueado.role === "admin") {
    req.user = logueado;
    next();
  } else {
    res
      .status(403)
      .send({ status: "Error", message: "Access denied. Admins only." });
  }
}

async function onlyUser(req, res, next) {
  let logueado;
  let expired = false;
  try {
    logueado = (await reviseBearer(req)) || (await reviseCookie(req));
  } catch (e) {
    if (e.isExpired) {
      expired = true;
    } else {
      return res
        .status(403)
        .send({ status: "Error", message: "Access denied. Users only." });
    }
  }

  if (!logueado && expired) {
    logueado = await tryRefreshAccessToken(req, res);
  }

  if (logueado && logueado.role === "user") {
    req.user = logueado;
    next();
  } else {
    res
      .status(403)
      .send({ status: "Error", message: "Access denied. Users only." });
  }
}

function getBearerTokenFromReq(req) {
  const rawHeader = req?.headers?.authorization || req?.headers?.authentication;
  if (!rawHeader || typeof rawHeader !== "string") {
    return null;
  }
  console.log(rawHeader);

  const [scheme, token] = rawHeader.split(" ");
  if (!scheme || !token) {
    return null;
  }

  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function isValidJwtFormat(token) {
  // JWT format: 3 base64url-encoded parts separated by dots
  const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
  return (
    typeof token === "string" && jwtPattern.test(token) && token.length > 100
  );
}

async function reviseBearer(req) {
  try {
    const bearerToken = getBearerTokenFromReq(req);
    if (!bearerToken) {
      return false;
    }

    // Add format validation
    if (!isValidJwtFormat(bearerToken)) {
      console.error(
        "Invalid JWT format in Bearer token:",
        bearerToken?.substring(0, 20) + "...",
      );
      return false;
    }

    const decodificado = jsonwebtoken.verify(
      bearerToken,
      process.env.JWT_SECRET_KEY,
    );

    const hasUserId =
      decodificado?.userId !== undefined && decodificado?.userId !== null;
    console.log(decodificado);

    const findUser = await prisma.user.findFirst({
      where: hasUserId
        ? { id: String(decodificado.userId) }
        : { email: decodificado.email },
    });

    if (!findUser) {
      return false;
    }
    return cryptoUtils.decryptFields(
      findUser,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      const expiredError = new Error("Token expired");
      expiredError.isExpired = true;
      throw expiredError;
    }
    console.error("Error al verificar el bearer token:", error);
    return false;
  }
}

async function reviseCookie(req) {
  try {
    const cookieJWT = req.cookies.access_token;

    if (!cookieJWT) {
      return false;
    }
    console.log(cookieJWT);

    // Add format validation
    if (!isValidJwtFormat(cookieJWT)) {
      console.error(
        "Invalid JWT format in Cookie token:",
        cookieJWT?.substring(0, 20) + "...",
      );
      return false;
    }

    const decodificado = jsonwebtoken.verify(
      cookieJWT,
      process.env.JWT_SECRET_KEY,
    );
    console.log(decodificado);

    const hasUserId =
      decodificado?.userId !== undefined && decodificado?.userId !== null;

    const findUser = await prisma.user.findFirst({
      where: hasUserId
        ? { id: String(decodificado.userId) }
        : { email: decodificado.email },
    });

    if (!findUser) {
      if (typeof req?.res?.clearCookie === "function") {
        req.res.clearCookie("access_token", {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          path: "/",
          domain: process.env.ORIGIN,
        });
      }
      return false;
    }
    return cryptoUtils.decryptFields(
      findUser,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      const expiredError = new Error("Token expired");
      expiredError.isExpired = true;
      throw expiredError;
    }
    console.error("Error al verificar la cookie:", error);
    return false;
  }
}

export const authorization = {
  isLoged,
  reviseBearer,
  reviseCookie,
  onlyAdmin,
  onlyUser,
  tryRefreshAccessToken,
};
