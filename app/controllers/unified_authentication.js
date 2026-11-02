import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma.js";
import { UnifiedAuthSchemas } from "../schemas/unified_auth.js";
import { IdentityFactory } from "../domain/IdentityFactory.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import { authMethods } from "../schemas/auth_methods.js";
import {
  buildAccessCookieOptions,
  issueRefreshToken,
} from "../middlewares/authorization.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { eventBus } from "../services/eventBus.js";

dotenv.config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const android_client_id = process.env.GOOGLE_CLIENT_ID_ANDROID;
const extra_client_ids = (process.env.GOOGLE_CLIENT_ID_EXTRA ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getEnterpriseCookieOptions() {
  const expirationDays = Number(process.env.JWT_COOKIES_EXPIRATION_TIME) || 15;
  return {
    expires: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: expirationDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * Autentica o crea un usuario a través del token de Google OAuth.
 */
async function handleGoogleAuthentication(idToken, consents, req, res, next) {
  const oauth2Client = new OAuth2Client();
  let payload;
  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: [android_client_id, client_id, ...extra_client_ids].filter(
        Boolean,
      ),
    });
    payload = ticket.getPayload();
  } catch (verifyError) {
    console.error("Google token verification failed:", verifyError?.message);
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

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name || "";
  const picture = payload.picture || "";

  let rawUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { google_id: googleId }] },
    include: {
      role: true,
      enterpriseMemberships: {
        where: { status: "ACTIVE" },
        include: { enterprise: true },
      },
      cars: { select: { id_coche: true } },
    },
  });

  if (!rawUser) {
    // Si no existe, crear automáticamente la persona física
    const { methods: dbUtils } = await import("../utils/db.js");
    const userResult = await dbUtils.createUser(
      { email, password: "", name },
      authMethods.GOOGLE,
      googleId,
    );

    if (userResult?.status !== "Success") {
      return next(
        new AppError(
          "No se pudo completar el registro mediante Google.",
          500,
          "REGISTRATION_FAILED",
        ),
      );
    }

    rawUser = await prisma.user.findUnique({
      where: { id: userResult.user.id },
      include: {
        role: true,
        enterpriseMemberships: {
          where: { status: "ACTIVE" },
          include: { enterprise: true },
        },
        cars: { select: { id_coche: true } },
      },
    });

    if (picture && rawUser) {
      await prisma.user.update({
        where: { id: rawUser.id },
        data: { img_perfil: picture },
      });
      rawUser.img_perfil = picture;
    }

    await eventBus.userRegistered(rawUser.id, email, authMethods.GOOGLE, rawUser.role?.name ?? "user");
  }

  const decryptedUser = cryptoUtils.decryptFields(
    rawUser,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  const domainEntity = IdentityFactory.createFromUser(
    decryptedUser,
    rawUser.enterpriseMemberships,
  );

  const token = domainEntity.generateJwtToken();
  res.cookie("access_token", token, buildAccessCookieOptions());
  await issueRefreshToken(res, domainEntity.id);
  await eventBus.userLogin(domainEntity.id, email, domainEntity.roleName || "user");

  return res.status(200).json(
    domainEntity.toUnifiedAuthResponse({
      token,
      allMemberships: domainEntity.allMemberships,
    }),
  );
}

/**
 * Autentica mediante correo y contraseña, resolviendo si es Persona Jurídica o Física.
 */
async function handlePasswordAuthentication(email, password, authType, req, res, next) {
  // Búsqueda concurrente optimizada con índices de base de datos
  const [rawUser, rawEnterprise] = await Promise.all([
    authType === "enterprise"
      ? null
      : prisma.user.findUnique({
          where: { email },
          include: {
            role: true,
            enterpriseMemberships: {
              where: { status: "ACTIVE" },
              include: { enterprise: true },
            },
            cars: { select: { id_coche: true } },
          },
        }),
    authType === "user"
      ? null
      : prisma.enterprise.findUnique({
          where: { email },
          include: { role: true },
        }),
  ]);

  // 1. Probar primero si es cuenta de Organización (Persona Jurídica)
  if (rawEnterprise && authType !== "user") {
    const domainEnterprise = IdentityFactory.createFromEnterprise(rawEnterprise);
    const passwordMatch = await domainEnterprise.verifyPassword(password);

    if (passwordMatch) {
      if (domainEnterprise.isDeleted) {
        return next(
          new AppError(
            "Esta organización ha sido dada de baja. Contacta con el administrador del sistema.",
            403,
            "ORGANIZATION_DELETED",
          ),
        );
      }

      if (!domainEnterprise.isActive) {
        return next(
          new AppError(
            "Esta cuenta de organización se encuentra temporalmente desactivada.",
            403,
            "ORGANIZATION_INACTIVE",
          ),
        );
      }

      const token = domainEnterprise.generateJwtToken();
      res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());
      res.cookie("access_token", token, buildAccessCookieOptions());

      return res
        .status(200)
        .json(domainEnterprise.toUnifiedAuthResponse({ token }));
    }
  }

  // 2. Probar si es Persona Física (Usuario Regular o Empleado)
  if (rawUser && authType !== "enterprise") {
    const decryptedUser = cryptoUtils.decryptFields(
      rawUser,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );

    if (decryptedUser.auth_method === authMethods.GOOGLE) {
      return next(
        new AppError(
          "Esta cuenta fue creada con Google. Inicia sesión usando el botón de Google.",
          400,
          "WRONG_AUTH_METHOD",
        ),
      );
    }

    const passwordMatch = await bcrypt.compare(
      password,
      decryptedUser.password || "",
    );

    if (passwordMatch) {
      const domainUser = IdentityFactory.createFromUser(
        decryptedUser,
        rawUser.enterpriseMemberships,
      );

      if (domainUser.isDeleted) {
        return next(
          new AppError(
            "Esta cuenta de usuario ha sido desactivada.",
            403,
            "ACCOUNT_DELETED",
          ),
        );
      }

      if (!domainUser.isActive) {
        return next(
          new AppError(
            "Tu cuenta está actualmente suspendida.",
            403,
            "ACCOUNT_INACTIVE",
          ),
        );
      }

      const token = domainUser.generateJwtToken();
      res.cookie("access_token", token, buildAccessCookieOptions());
      await issueRefreshToken(res, domainUser.id);
      await eventBus.userLogin(
        domainUser.id,
        email,
        domainUser.roleName || "user",
      );

      return res.status(200).json(
        domainUser.toUnifiedAuthResponse({
          token,
          allMemberships: domainUser.allMemberships,
        }),
      );
    }
  }

  // 3. Ni organización ni usuario coincidieron con las credenciales
  return next(
    new AppError(
      "Correo electrónico o contraseña incorrectos.",
      401,
      "INVALID_CREDENTIALS",
    ),
  );
}

/**
 * Endpoint Unificado de Inicio de Sesión.
 * Admite tanto credenciales (email + password) como token social de Google (id_token).
 * POST /api/auth/unified-login
 */
const unifiedLogin = catchAsync(async (req, res, next) => {
  const validation = UnifiedAuthSchemas.validateUnifiedLogin(req.body);
  if (!validation.success) {
    const errorMessage =
      validation.error.issues?.[0]?.message ||
      validation.error.errors?.[0]?.message ||
      "Datos de autenticación inválidos";
    return next(
      new AppError(errorMessage, 400, "VALIDATION_ERROR"),
    );
  }

  const {
    email,
    password,
    id_token,
    google_token,
    auth_type,
    consents,
  } = validation.data;

  // Si se provee token de Google
  const effectiveGoogleToken = id_token || google_token;
  if (effectiveGoogleToken) {
    return handleGoogleAuthentication(effectiveGoogleToken, consents, req, res, next);
  }

  // Si se proveen credenciales tradicionales (email + contraseña)
  return handlePasswordAuthentication(email, password, auth_type, req, res, next);
});

export const unifiedAuthentication = {
  unifiedLogin,
};

export const methods = unifiedAuthentication;
