import crypto from "crypto";
import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma.js";
import { methods as utils } from "../utils/hashing.js";
import { EnterpriseSchemas } from "../schemas/enterprise.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";
import { authorization } from "../middlewares/authorization.js";
import { EnterpriseUser } from "../domain/EnterpriseUser.js";
import { getUserData } from "../providers/google-auth.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";

dotenv.config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const secret_id = process.env.GOOGLE_OAUTH;
const android_client_id = process.env.GOOGLE_ANDROID_CLIENT_ID;
const extra_client_ids = (process.env.GOOGLE_EXTRA_CLIENT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getFrontendUrl() {
  let fe = process.env.ORIGIN || "http://localhost:5173/";
  return fe.endsWith("/") ? fe : `${fe}/`;
}

function getBackendOrigin() {
  let be = process.env.MY_ORIGIN || "http://localhost:3000/";
  return be.endsWith("/") ? be : `${be}/`;
}

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
 * Registro público para nuevas Organizaciones / Empresas.
 * Requiere únicamente correo electrónico y contraseña.
 * Tras el registro, inicia sesión automáticamente para completar el onboarding corporativo.
 */
async function register(req, res) {
  const result = EnterpriseSchemas.validateEnterpriseRegister(req.body);
  if (!result.success) {
    return res.status(400).json({
      status: "Error",
      message: JSON.parse(result.error.message),
    });
  }

  const { email, password, name } = result.data;

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

  const hash = await utils.hashValue(10, password);
  const defaultName = name && name.trim().length > 0 ? name.trim() : email.split("@")[0];

  try {
    const enterprise = await prisma.enterprise.create({
      data: {
        name: defaultName,
        email,
        password: hash,
        verified: false,
        onboarding_ended: false,
        is_active: true,
        is_deleted: false,
        role_id: 3,
        country: "ES",
      },
      include: { role: true },
    });

    const domainEntity = new EnterpriseUser(enterprise);
    const token = domainEntity.generateJwtToken();

    res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

    return res.status(201).json({
      status: "Success",
      message: "Organización registrada exitosamente.",
      token,
      role: "enterprise",
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

/**
 * Inicia el flujo OAuth con Google para Organizaciones.
 * Genera la URL de autorización con Google según el método (login o register).
 * POST /api/enterprise/auth/oauth?method=login|register
 */
const oauthGoogle = catchAsync(async (req, res, next) => {
  const method = req.query.method || req.body?.method;
  const backendOrigin = getBackendOrigin();
  let redirectUrl;

  switch (method) {
    case "login":
      redirectUrl = `${backendOrigin}api/enterprise/auth/oauth/login`;
      break;
    case "register":
      redirectUrl = `${backendOrigin}api/enterprise/auth/oauth/register`;
      break;
    default:
      return next(
        new AppError(
          "Método no válido. Debe ser 'login' o 'register'.",
          400,
          "INVALID_OAUTH_METHOD",
        ),
      );
  }

  const oauth2Client = new OAuth2Client(client_id, secret_id, redirectUrl);

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: "profile openid email",
    prompt: "consent",
  });

  return res.status(200).json({
    status: "Success",
    url: authorizeUrl,
  });
});

/**
 * Callback de redirección de Google OAuth para registro de Empresa.
 * GET /api/enterprise/auth/oauth/register
 */
async function oauthGoogleRegisterCallback(req, res) {
  const code = req.query.code;
  const frontendUrl = getFrontendUrl();
  const backendOrigin = getBackendOrigin();
  const backendRedirectUrl = `${backendOrigin}api/enterprise/auth/oauth/register`;

  try {
    if (!code) {
      return res.redirect(`${frontendUrl}enterprise/register?error=code_missing`);
    }

    const oauth2Client = new OAuth2Client(
      client_id,
      secret_id,
      backendRedirectUrl,
    );

    const result = await oauth2Client.getToken(code);
    const { tokens } = result;
    await oauth2Client.setCredentials(tokens);

    const googleUserData = await getUserData(tokens.access_token);
    if (!googleUserData || !googleUserData.email) {
      return res.redirect(`${frontendUrl}enterprise/register?error=google_no_email`);
    }

    const email = googleUserData.email.toLowerCase().trim();

    const existingEnterprise = await prisma.enterprise.findUnique({
      where: { email },
    });

    if (existingEnterprise) {
      return res.redirect(`${frontendUrl}enterprise/register?error=enterprise_exists`);
    }

    // Contraseña segura aleatoria para inicializar el registro
    const randomPassword = crypto.randomBytes(24).toString("hex") + "A1!";
    const passwordHash = await utils.hashValue(10, randomPassword);
    const defaultName =
      googleUserData.name && googleUserData.name.trim().length > 0
        ? googleUserData.name.trim()
        : email.split("@")[0];

    const enterprise = await prisma.enterprise.create({
      data: {
        name: defaultName,
        email,
        password: passwordHash,
        verified: true,
        onboarding_ended: false,
        is_active: true,
        is_deleted: false,
        role_id: 3,
        country: "ES",
      },
      include: { role: true },
    });

    const domainEntity = new EnterpriseUser(enterprise);
    const token = domainEntity.generateJwtToken();

    res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

    const finalRedirectUrl = `${frontendUrl}enterprise/onboarding?token=${token}&enterpriseId=${encodeURIComponent(
      enterprise.id,
    )}`;
    return res.redirect(finalRedirectUrl);
  } catch (error) {
    console.error("Error en el flujo Google OAuth Register para Empresa:", error);
    return res.redirect(`${frontendUrl}enterprise/register?error=auth_failed`);
  }
}

/**
 * Callback de redirección de Google OAuth para login de Empresa.
 * GET /api/enterprise/auth/oauth/login
 */
async function oauthGoogleLoginCallback(req, res) {
  const code = req.query.code;
  const frontendUrl = getFrontendUrl();
  const backendOrigin = getBackendOrigin();
  const backendRedirectUrl = `${backendOrigin}api/enterprise/auth/oauth/login`;

  try {
    if (!code) {
      return res.redirect(`${frontendUrl}enterprise/login?error=code_missing`);
    }

    const oauth2Client = new OAuth2Client(
      client_id,
      secret_id,
      backendRedirectUrl,
    );

    const result = await oauth2Client.getToken(code);
    const { tokens } = result;
    await oauth2Client.setCredentials(tokens);

    const googleUserData = await getUserData(tokens.access_token);
    if (!googleUserData || !googleUserData.email) {
      return res.redirect(`${frontendUrl}enterprise/login?error=google_no_email`);
    }

    const email = googleUserData.email.toLowerCase().trim();

    const enterprise = await prisma.enterprise.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!enterprise) {
      return res.redirect(`${frontendUrl}enterprise/login?error=enterprise_not_found`);
    }

    if (enterprise.is_deleted) {
      return res.redirect(`${frontendUrl}enterprise/login?error=enterprise_deleted`);
    }

    if (!enterprise.is_active) {
      return res.redirect(`${frontendUrl}enterprise/login?error=enterprise_inactive`);
    }

    const domainEntity = new EnterpriseUser(enterprise);
    const token = domainEntity.generateJwtToken();

    res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

    const destination = domainEntity.isOnboardingEnded
      ? `${frontendUrl}enterprise/dashboard?token=${token}`
      : `${frontendUrl}enterprise/onboarding?token=${token}&enterpriseId=${encodeURIComponent(
          enterprise.id,
        )}`;

    return res.redirect(destination);
  } catch (error) {
    console.error("Error en el flujo Google OAuth Login para Empresa:", error);
    return res.redirect(`${frontendUrl}enterprise/login?error=auth_failed`);
  }
}

/**
 * Autenticación directa corporativa con ID Token de Google (One-Tap / SDK / React).
 * POST /api/enterprise/auth/google
 */
const oauthGoogleToken = catchAsync(async (req, res, next) => {
  const validation = EnterpriseSchemas.validateEnterpriseGoogleAuth(req.body);
  if (!validation.success) {
    return res.status(400).json({
      status: "Error",
      message: JSON.parse(validation.error.message),
    });
  }

  const { id_token, method = "auto" } = validation.data;

  const oauth2Client = new OAuth2Client();
  let payload;
  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: id_token,
      audience: [android_client_id, client_id, ...extra_client_ids].filter(
        Boolean,
      ),
    });
    payload = ticket.getPayload();
  } catch (verifyError) {
    console.error(
      "Enterprise Google token verification failed:",
      verifyError?.message,
    );
    return next(
      new AppError(
        "El token de Google no es válido o ha expirado.",
        401,
        "GOOGLE_TOKEN_INVALID",
      ),
    );
  }

  if (!payload || !payload.email) {
    return next(
      new AppError(
        "No se pudo obtener el correo asociado a la cuenta de Google.",
        400,
        "GOOGLE_NO_EMAIL",
      ),
    );
  }

  const email = payload.email.toLowerCase().trim();
  const name = payload.name || "";

  let enterprise = await prisma.enterprise.findUnique({
    where: { email },
    include: { role: true },
  });

  if (method === "register" && enterprise) {
    return res.status(409).json({
      status: "Error",
      message: "Ya existe una empresa registrada con este correo electrónico.",
    });
  }

  if (method === "login" && !enterprise) {
    return res.status(404).json({
      status: "Error",
      message: "No existe ninguna empresa asociada a esta cuenta de Google.",
    });
  }

  let isNew = false;
  if (!enterprise) {
    const randomPassword = crypto.randomBytes(24).toString("hex") + "A1!";
    const passwordHash = await utils.hashValue(10, randomPassword);
    const defaultName =
      name.trim().length > 0 ? name.trim() : email.split("@")[0];

    enterprise = await prisma.enterprise.create({
      data: {
        name: defaultName,
        email,
        password: passwordHash,
        verified: true,
        onboarding_ended: false,
        is_active: true,
        is_deleted: false,
        role_id: 3,
        country: "ES",
      },
      include: { role: true },
    });
    isNew = true;
  }

  if (enterprise.is_deleted) {
    return res.status(403).json({
      status: "Error",
      message:
        "Esta organización ha sido dada de baja. Contacta con el administrador del sistema.",
    });
  }

  if (!enterprise.is_active) {
    return res.status(403).json({
      status: "Error",
      message: "Esta cuenta se encuentra temporalmente desactivada.",
    });
  }

  const domainEntity = new EnterpriseUser(enterprise);
  const token = domainEntity.generateJwtToken();

  res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

  return res.status(isNew ? 201 : 200).json({
    status: "Success",
    message: isNew
      ? "Organización registrada exitosamente mediante Google."
      : "Inicio de sesión corporativo con Google exitoso.",
    token,
    role: "enterprise",
    is_new: isNew,
    enterprise: domainEntity.toSafeJSON(),
  });
});

export const methods = {
  register,
  login,
  changePassword,
  logout,
  validate,
  oauthGoogle,
  oauthGoogleRegisterCallback,
  oauthGoogleLoginCallback,
  oauthGoogleToken,
  getEnterpriseCookieOptions,
  getFrontendUrl,
  getBackendOrigin,
};
