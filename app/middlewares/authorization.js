import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import database from "../database.js";
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

async function reviseBearer(req) {
  try {
    const bearerToken = getBearerTokenFromReq(req);
    if (!bearerToken) {
      return false;
    }

    const decodificado = jsonwebtoken.verify(
      bearerToken,
      process.env.JWT_SECRET_KEY,
    );

    const resultado = await database.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [decodificado.email],
    });
    console.log("Autenticando token");

    const findUser = resultado.rows[0];
    if (!findUser) {
      return false;
    }

    return findUser;
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

    const decodificado = jsonwebtoken.verify(
      cookieJWT,
      process.env.JWT_SECRET_KEY,
    );

    const resultado = await database.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [decodificado.email],
    });
    console.log("Autenticando token");

    const findUser = resultado.rows[0];
    if (!findUser) {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        domain: process.env.ORIGIN,
      });
      return false;
    } else {
      return findUser;
    }
  } catch (error) {
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
};
