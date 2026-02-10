import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import database from "../database.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
dotenv.config();

async function isLoged(req, res, next) {
  const logueado = (await reviseBearer(req)) || (await reviseCookie(req));
  if (!logueado) {
    return res
      .status(403)
      .send({ status: "Error", message: "Access denied. Admins only." });
  }

  // Aquí podrías verificar si el usuario tiene el rol de administrador, accediendo a la base de datos
  if (logueado) {
    // Cambia esto a la lógica de verificación de administrador
    req.user = logueado;

    next(); // El usuario esta logueado, continuar con la siguiente función middleware
  } else {
    res
      .status(403)
      .send({ status: "Error", message: "Access denied. Admins only." });
  }
}

async function onlyAdmin(req, res, next) {
  const logueado = (await reviseBearer(req)) || (await reviseCookie(req));
  if (!logueado) {
    return res
      .status(403)
      .send({ status: "Error", message: "Access denied. Admins only." });
  }

  if (logueado.role === "admin") {
    next(); // El usuario es un administrador, continuar con la siguiente función middleware
  } else {
    res
      .status(403)
      .send({ status: "Error", message: "Access denied. Admins only." });
  }
}

async function onlyUser(req, res, next) {
  const logueado = (await reviseBearer(req)) || (await reviseCookie(req));
  // Aquí podrías verificar si el usuario tiene el rol de usuario
  // Por ejemplo, podrías verificar un campo en el token JWT o en la sesión del usuario
  if (logueado && logueado.role === "user") {
    next(); // El usuario es un usuario normal, continuar con la siguiente función middleware
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
    const resultado = await database.execute(
      hasUserId
        ? {
            sql: "SELECT * FROM users WHERE id = ?",
            args: [decodificado.userId],
          }
        : {
            sql: "SELECT * FROM users WHERE email = ?",
            args: [decodificado.email],
          },
    );

    const findUser = resultado.rows[0];
    if (!findUser) {
      return false;
    }
    return cryptoUtils.decryptFields(
      findUser,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
  } catch (error) {
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

    const hasUserId =
      decodificado?.userId !== undefined && decodificado?.userId !== null;
    const resultado = await database.execute(
      hasUserId
        ? {
            sql: "SELECT * FROM users WHERE id = ?",
            args: [decodificado.userId],
          }
        : {
            sql: "SELECT * FROM users WHERE email = ?",
            args: [decodificado.email],
          },
    );

    const findUser = resultado.rows[0];
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
    } else {
      return cryptoUtils.decryptFields(
        findUser,
        cryptoUtils.USER_SENSITIVE_FIELDS,
      );
    }
  } catch (error) {
    if (error.name !== "TokenExpiredError") {
      console.error("Error al verificar la cookie:", error);
    }
    return false;
  }
}

export const authorization = {
  isLoged,
  reviseBearer,
  reviseCookie,
  onlyAdmin,
  onlyUser,
};
