import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { PUBLIC_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";
import { authorization } from "./authorization.js";

dotenv.config();

function getBearerToken(req) {
  const header = req.headers?.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.replace("Bearer ", "").trim();
}

/**
 * Revisa la identidad de una empresa/organización mediante cookie o Bearer token.
 * Valida que la empresa exista, esté activa y no esté eliminada lógicamente.
 * @param {object} req 
 * @returns {Promise<object|false>}
 */
async function reviseEnterprise(req) {
  try {
    const token =
      req.cookies?.enterprise_access_token ||
      getBearerToken(req) ||
      req.cookies?.access_token;

    if (!token) return false;

    let decoded;
    try {
      decoded = jsonwebtoken.verify(token, PUBLIC_KEY, {
        algorithms: [JWT_ALGORITHM],
      });
    } catch (_err) {
      return false;
    }

    const enterpriseId = decoded?.enterprise_id || decoded?.userId;
    const email = decoded?.email;

    if (!enterpriseId && !email) return false;

    const enterprise = await prisma.enterprise.findFirst({
      where: enterpriseId ? { id: enterpriseId } : { email },
      include: { role: true },
    });

    if (!enterprise) return false;

    // Si la organización está eliminada o suspendida, no se permite acceso
    if (enterprise.is_deleted || !enterprise.is_active) {
      return false;
    }

    return enterprise;
  } catch (error) {
    console.error("Error al verificar autenticación de empresa:", error);
    return false;
  }
}

/**
 * Middleware para asegurar que la solicitud proviene de una Organización autenticada y activa.
 */
async function isEnterpriseLoged(req, res, next) {
  const enterprise = await reviseEnterprise(req);
  if (!enterprise) {
    return res.status(403).json({
      status: "Error",
      message: "Acceso denegado. Se requiere cuenta de organización activa.",
    });
  }

  req.enterprise = enterprise;
  next();
}

/**
 * Middleware híbrido: Permite el acceso si el solicitante es Administrador o la propia Organización.
 * Previene IDOR validando que una organización solo pueda operar sobre su propio recurso :id.
 */
async function isEnterpriseOrAdmin(req, res, next) {
  // 1. Probar autenticación de Administrador
  try {
    const adminUser =
      (await authorization.reviseBearer(req)) ||
      (await authorization.reviseCookie(req));

    if (adminUser && adminUser.role?.name === "admin") {
      req.user = adminUser;
      req.isAdmin = true;
      return next();
    }
  } catch (_e) {
    // Si no es admin, intentamos autenticación de empresa
  }

  // 2. Probar autenticación de Organización
  const enterprise = await reviseEnterprise(req);
  if (enterprise) {
    req.enterprise = enterprise;
    req.isEnterprise = true;

    // Validación de propiedad sobre :id si aplica
    const targetId = req.params?.id;
    if (targetId && targetId !== enterprise.id) {
      return res.status(403).json({
        status: "Error",
        message: "No tienes permisos para acceder o modificar los datos de otra organización.",
      });
    }

    return next();
  }

  return res.status(401).json({
    status: "Error",
    message: "No autorizado. Se requiere rol de Administrador o de la propia Organización.",
  });
}

const ROLE_HIERARCHY = {
  ADMIN: 3,
  MANAGER: 2,
  EMPLOYEE: 1,
};

/**
 * Middleware RBAC granular para miembros de la organización.
 * Soporta SuperAdmin, credenciales corporativas directas y usuarios con membresía activa.
 * @param {"ADMIN" | "MANAGER" | "EMPLOYEE"} requiredRole 
 */
function requireEnterpriseRole(requiredRole = "EMPLOYEE") {
  const minWeight = ROLE_HIERARCHY[requiredRole.toUpperCase()] || 1;

  return async function (req, res, next) {
    const targetEnterpriseId =
      req.params?.enterpriseId ||
      req.params?.id ||
      req.body?.enterprise_id ||
      req.query?.enterpriseId;

    // 1. Super Admin de la plataforma
    try {
      const adminUser =
        (await authorization.reviseBearer(req)) ||
        (await authorization.reviseCookie(req));

      if (adminUser && adminUser.role?.name === "admin") {
        req.user = adminUser;
        req.isAdmin = true;
        req.effectiveEnterpriseRole = "ADMIN";
        return next();
      }
    } catch (_e) {}

    // 2. Token directo de Empresa (cuenta institucional)
    const enterprise = await reviseEnterprise(req);
    if (enterprise) {
      if (targetEnterpriseId && enterprise.id !== targetEnterpriseId) {
        return res.status(403).json({
          status: "Error",
          message: "No tienes permiso para operar sobre otra organización.",
        });
      }
      req.enterprise = enterprise;
      req.isEnterprise = true;
      req.effectiveEnterpriseRole = "ADMIN";
      return next();
    }

    // 3. Usuario particular con membresía activa en la empresa
    try {
      const normalUser =
        (await authorization.reviseBearer(req)) ||
        (await authorization.reviseCookie(req));

      if (normalUser && targetEnterpriseId) {
        const membership = await prisma.enterpriseMember.findFirst({
          where: {
            enterprise_id: targetEnterpriseId,
            user_id: normalUser.id,
            status: "ACTIVE",
          },
          include: { enterprise: true },
        });

        if (membership) {
          const userWeight = ROLE_HIERARCHY[membership.role] || 0;
          if (userWeight >= minWeight) {
            req.user = normalUser;
            req.enterprise = membership.enterprise;
            req.enterpriseMember = membership;
            req.effectiveEnterpriseRole = membership.role;
            return next();
          }

          return res.status(403).json({
            status: "Error",
            message: `Permisos insuficientes en la organización. Se requiere rol ${requiredRole}.`,
          });
        }
      }
    } catch (_e) {}

    return res.status(401).json({
      status: "Error",
      message:
        "No autorizado. Se requiere acceso con rol suficiente en la organización.",
    });
  };
}

export const enterpriseAuthorization = {
  reviseEnterprise,
  reviseEnterpriseCookie: reviseEnterprise,
  isEnterpriseLoged,
  isEnterpriseOrAdmin,
  requireEnterpriseRole,
};
