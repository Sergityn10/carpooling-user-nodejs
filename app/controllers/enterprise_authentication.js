import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { methods as utils } from "../utils/hashing.js";
import { EnterpriseSchemas } from "../schemas/enterprise.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";
import { authorization } from "../middlewares/authorization.js";
import { EnterpriseUser } from "../domain/EnterpriseUser.js";

dotenv.config();

function getEnterpriseCookieOptions() {
  const days = Number(
    process.env.ENTERPRISE_COOKIE_EXPIRATION_DAYS ||
      process.env.JWT_COOKIES_EXPIRATION_TIME ||
      7,
  );
  const maxAge = days * 24 * 60 * 60 * 1000;
  return {
    expires: new Date(Date.now() + maxAge),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge,
  };
}

/**
 * Registro de empresas: Exclusivo para administradores.
 */
async function register(req, res) {
  // Comprobación de seguridad: solo el rol admin puede dar de alta organizaciones
  const adminUser =
    (await authorization.reviseBearer(req)) ||
    (await authorization.reviseCookie(req));

  if (!adminUser || adminUser.role?.name !== "admin") {
    return res.status(403).json({
      status: "Error",
      message:
        "Acceso denegado. Únicamente los administradores pueden dar de alta una nueva organización.",
    });
  }

  const result = EnterpriseSchemas.validateEnterpriseCreate(req.body);
  if (!result.success) {
    return res.status(400).json({
      status: "Error",
      message: JSON.parse(result.error.message),
    });
  }

  const {
    name,
    email,
    password,
    description,
    location,
    phone,
    cif,
    website,
    logo,
    contact_person,
    sector,
    employee_count,
    address_line1,
    address_line2,
    city,
    province,
    postal_code,
    country,
  } = result.data;

  const exists = await prisma.enterprise.findUnique({
    where: { email },
    select: { id: true },
  });

  if (exists) {
    return res.status(409).json({
      status: "Error",
      message: "Ya existe una empresa registrada con este correo electrónico.",
    });
  }

  if (cif) {
    const existingCif = await prisma.enterprise.findUnique({
      where: { cif },
      select: { id: true },
    });
    if (existingCif) {
      return res.status(409).json({
        status: "Error",
        message: "Ya existe una empresa registrada con este CIF/NIF.",
      });
    }
  }

  const hash = await utils.hashValue(10, password);

  try {
    const enterprise = await prisma.enterprise.create({
      data: {
        name,
        email,
        password: hash,
        description,
        location,
        phone: phone ?? null,
        cif: cif ?? null,
        website: website ?? null,
        logo: logo ?? null,
        contact_person: contact_person ?? null,
        sector: sector ?? null,
        employee_count: employee_count ?? null,
        address_line1: address_line1 ?? null,
        address_line2: address_line2 ?? null,
        city: city ?? null,
        province: province ?? null,
        postal_code: postal_code ?? null,
        country: country ?? "ES",
        verified: false,
        is_active: true,
        is_deleted: false,
        role_id: 3,
      },
    });

    const domainEntity = new EnterpriseUser(enterprise);

    return res.status(201).json({
      status: "Success",
      message: "Organización registrada exitosamente por el administrador.",
      enterprise: domainEntity.toSafeJSON(),
    });
  } catch (error) {
    console.error("Error registrando empresa:", error);
    return res.status(500).json({
      status: "Error",
      message: "No se pudo completar el registro de la empresa en la base de datos.",
    });
  }
}

/**
 * Inicio de sesión para Organizaciones / Empresas.
 */
async function login(req, res) {
  const result = EnterpriseSchemas.validateEnterpriseLogin(req.body);
  if (!result.success) {
    return res.status(400).json({
      status: "Error",
      message: JSON.parse(result.error.message),
    });
  }

  const { email, password } = result.data;

  const enterprise = await prisma.enterprise.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!enterprise) {
    return res.status(401).json({
      status: "Error",
      message: "Correo electrónico o contraseña incorrectos.",
    });
  }

  // Validación de borrado lógico
  if (enterprise.is_deleted) {
    return res.status(403).json({
      status: "Error",
      message: "Esta organización ha sido dada de baja. Contacta con el administrador del sistema.",
    });
  }

  // Validación de cuenta suspendida/inactiva
  if (!enterprise.is_active) {
    return res.status(403).json({
      status: "Error",
      message: "Esta cuenta se encuentra temporalmente desactivada.",
    });
  }

  const domainEntity = new EnterpriseUser(enterprise);
  const isMatch = await domainEntity.verifyPassword(password);

  if (!isMatch) {
    return res.status(401).json({
      status: "Error",
      message: "Correo electrónico o contraseña incorrectos.",
    });
  }

  const token = domainEntity.generateJwtToken();

  res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

  return res.status(200).json({
    status: "Success",
    message: "Inicio de sesión correcto.",
    token,
    role: "enterprise",
    enterprise: domainEntity.toSafeJSON(),
  });
}

/**
 * Cambio de contraseña seguro para la propia organización autenticada.
 */
async function changePassword(req, res) {
  const enterprise = req.enterprise;
  if (!enterprise) {
    return res.status(401).json({
      status: "Error",
      message: "Autenticación requerida.",
    });
  }

  const result = EnterpriseSchemas.validateEnterpriseChangePassword(req.body);
  if (!result.success) {
    return res.status(400).json({
      status: "Error",
      message: JSON.parse(result.error.message),
    });
  }

  const { current_password, new_password } = result.data;

  // Verificación de la contraseña actual
  const isMatch = await bcrypt.compare(current_password, enterprise.password);
  if (!isMatch) {
    return res.status(400).json({
      status: "Error",
      message: "La contraseña actual introducida no es correcta.",
    });
  }

  // Cifrado robusto de la nueva clave
  const hashedPassword = await utils.hashValue(10, new_password);

  try {
    await prisma.enterprise.update({
      where: { id: enterprise.id },
      data: {
        password: hashedPassword,
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: "Success",
      message: "Contraseña modificada correctamente con las directivas de seguridad requeridas.",
    });
  } catch (error) {
    console.error("Error al actualizar la contraseña de la empresa:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al actualizar la contraseña en el servidor.",
    });
  }
}

/**
 * Cierre de sesión de la organización.
 */
async function logout(req, res) {
  res.clearCookie("enterprise_access_token", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  return res.status(200).json({
    status: "Success",
    message: "Sesión cerrada correctamente.",
  });
}

/**
 * Validación del token de sesión de la organización.
 */
async function validate(req, res) {
  try {
    const enterprise = await enterpriseAuthorization.reviseEnterprise(req);
    if (!enterprise) {
      return res.status(401).json({
        status: "Error",
        message: "El token de acceso no es válido o ha expirado.",
      });
    }

    const domainEntity = new EnterpriseUser(enterprise);
    const token = domainEntity.generateJwtToken(
      process.env.ENTERPRISE_JWT_EXPIRATION || "7d",
    );

    res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

    return res.status(200).json({
      status: "Success",
      message: "Token válido.",
      token,
      role: "enterprise",
      enterprise: domainEntity.toSafeJSON(),
      data: domainEntity.toSafeJSON(),
    });
  } catch (error) {
    res.clearCookie("enterprise_access_token", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    return res.status(401).json({
      status: "Error",
      message: "No se pudo verificar la sesión. Inicia sesión de nuevo.",
    });
  }
}

export const methods = {
  register,
  login,
  changePassword,
  logout,
  validate,
};
