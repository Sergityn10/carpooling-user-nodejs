import jsonwebtoken from "jsonwebtoken";
import { PUBLIC_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

/**
 * Whitelist inmutable de algoritmos criptográficos permitidos.
 * Mitiga CRIT-01 (rechaza terminantemente 'none' y algoritmos simétricos no autorizados).
 */
const STRICT_ALGORITHMS = [JWT_ALGORITHM || "RS256"];

/**
 * Extrae el Bearer token de cabeceras o de cookies.
 */
export function extractToken(req) {
  const authHeader = req?.headers?.authorization || req?.headers?.authentication;
  if (typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
      return token.trim();
    }
  }

  const cookieToken = req?.cookies?.access_token;
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}

/**
 * Valida la firma del token contra la clave pública usando exclusivamente RS256.
 */
export function verifyStrictToken(token) {
  if (!token || typeof token !== "string") {
    const err = new Error("Token no proporcionado");
    err.code = "TOKEN_MISSING";
    throw err;
  }

  return jsonwebtoken.verify(token, PUBLIC_KEY, {
    algorithms: STRICT_ALGORITHMS,
  });
}

/**
 * Middleware de autenticación obligatoria y estricta.
 */
export function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        status: "Error",
        code: "UNAUTHORIZED",
        message: "Se requiere un token de acceso válido para este recurso.",
      });
    }

    const payload = verifyStrictToken(token);
    const userId = payload?.userId ?? payload?.id;

    if (!userId) {
      return res.status(401).json({
        status: "Error",
        code: "INVALID_CLAIMS",
        message: "Token inválido: identificador de usuario ausente.",
      });
    }

    req.user = {
      id: String(userId),
      email: payload.email,
      role: typeof payload.role === "string" ? payload.role : payload.role?.name ?? "user",
    };

    return next();
  } catch (error) {
    const isExpired = error.name === "TokenExpiredError";
    return res.status(401).json({
      status: "Error",
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message: isExpired ? "El token de sesión ha expirado." : "Token de acceso no válido.",
    });
  }
}

/**
 * Middleware para roles específicos (RBAC reutilizable).
 * @param  {...string} allowedRoles - Lista de roles permitidos (e.g. 'admin', 'enterprise')
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: "Error",
        code: "UNAUTHORIZED",
        message: "No autenticado.",
      });
    }

    const currentRole = req.user.role;
    if (!allowedRoles.includes(currentRole)) {
      return res.status(403).json({
        status: "Error",
        code: "FORBIDDEN",
        message: `Acceso restringido. Se requiere uno de los siguientes roles: ${allowedRoles.join(", ")}.`,
      });
    }

    return next();
  };
}

/**
 * Middleware de autorización a nivel de objeto (ABAC / Anti-IDOR / Anti-BOLA reutilizable).
 * @param {Function} getOwnerIdFn - Función selectora para extraer el ID propietario (e.g. req => req.params.id)
 * @param {Object} options - { allowAdmin: true }
 */
export function requireOwnership(getOwnerIdFn, { allowAdmin = true } = {}) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: "Error",
        code: "UNAUTHORIZED",
        message: "No autenticado.",
      });
    }

    if (allowAdmin && req.user.role === "admin") {
      return next();
    }

    const resourceOwnerId = String(getOwnerIdFn(req) ?? "");
    const authenticatedUserId = String(req.user.id ?? "");

    if (!resourceOwnerId || resourceOwnerId !== authenticatedUserId) {
      return res.status(403).json({
        status: "Error",
        code: "ACCESS_DENIED",
        message: "No tienes autorización para acceder a los datos de este usuario.",
      });
    }

    return next();
  };
}

/**
 * Middleware de autenticación opcional (no interrumpe si no hay token).
 */
export function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyStrictToken(token);
      const userId = payload?.userId ?? payload?.id;
      if (userId) {
        req.user = {
          id: String(userId),
          email: payload.email,
          role: typeof payload.role === "string" ? payload.role : payload.role?.name ?? "user",
        };
      }
    }
  } catch (_e) {
    // Si el token es inválido o expiró, simplemente se ignora y continúa anónimo
  }
  return next();
}
