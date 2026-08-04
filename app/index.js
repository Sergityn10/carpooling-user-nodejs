import express from "express";
import path from "path";
import z from "zod";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import cors from "cors";
import { authorization } from "./middlewares/authorization.js";
import { methods as cryptoUtils } from "./utils/crypto.js";
import { fileURLToPath } from "url";
import { methods as authentication } from "./controllers/authentication.js";
import { TelegramInfoServices as telegramInfo } from "./controllers/telegramInfo.js";
import prisma from "./lib/prisma.js";
import { methods as user } from "./controllers/user.js";
import { methods as webhook } from "./controllers/webhook.js";
import { methods as disponibilidad_semanal } from "./controllers/disponibilidad_semanal.js";
import { methods as payment } from "./controllers/payment.js";
import { methods as cars } from "./controllers/cars.js";
import { enterpriseAuthorization } from "./middlewares/enterpriseAuthorization.js";
import { methods as enterpriseAuthentication } from "./controllers/enterprise_authentication.js";
import { methods as enterprise } from "./controllers/enterprise.js";
import { methods as enterpriseServiceEvents } from "./controllers/enterprise_service_events.js";
import { methods as events } from "./controllers/events.js";
import { methods as companies } from "./controllers/companies.js";
import { methods as suggestions } from "./controllers/suggestions.js";
import { methods as caeReports } from "./controllers/cae-reports.js";
import { methods as legalConsent } from "./controllers/legalConsent.js";
import errorHandler from "./middlewares/errorHandler.js";
import AppError from "./utils/appError.js";
import { OAuth2Client } from "google-auth-library";
import { getUserData } from "./providers/google-auth.js";
import jsonwebtoken from "jsonwebtoken";
import { methods as dbUtils } from "./utils/db.js";
import { PRIVATE_KEY, JWT_ALGORITHM } from "./utils/jwtKeys.js";
dotenv.config();
//Configuracion del servidor
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let origin = process.env.ORIGIN;
origin = origin[origin.length - 1] !== "/" ? origin + "/" : origin;
console.log(origin);
let origin_without =
  origin[origin.length - 1] === "/" ? origin.slice(0, -1) : origin;
console.log(origin_without);
const trayectos_origin = process.env.TRAYECTOS_ORIGIN;
const messsages_origin = process.env.MESSSAGES_ORIGIN;
const app = express();
app.disable("x-powered-by"); // Desactiva el encabezado x-powered-by
app.set("port", process.env.PORT ?? 4000);
if (process.env.VERCEL !== "1") {
  app.listen(app.get("port"), () => {
    console.log("Servidor iniciado en el puerto " + app.get("port"));
  });
}

const client_id = process.env.GOOGLE_CLIENT_ID;
const secret_id = process.env.GOOGLE_OAUTH;

//Configuracion de la carpeta de archivos estaticos
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1); // <--- ESTO ES VITAL EN VERCEL
app.use(morgan("dev")); // Middleware para registrar las peticiones HTTP en la consola

// Stripe webhooks need the raw body for signature verification
app.use((req, res, next) => {
  if (req.originalUrl === "/api/webhook/stripe") {
    return express.raw({ type: "application/json" })(req, res, next);
  }
  return next();
});
app.post("/api/webhook/:source", (req, res) => webhook.createEvent(req, res));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "10mb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.JSON_BODY_LIMIT ?? "10mb",
  }),
);
app.use(cookieParser());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:4001",
      "http://localhost:3000",
      "https://www.youconnext.es",
      "https://app.youconnext.es",
      "https://youconnext-nextjs.vercel.app",
      "https://carpooling-webapp-ten.vercel.app",
      "https://youconnext-landing-page.vercel.app",

      origin,
      origin_without,
      trayectos_origin,
      messsages_origin,
    ], // Cambia esto a la URL de tu frontend
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true, // Permite el uso de cookies
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Middleware
// app.use((req, res, next) => {
//     console.log("Mi primer middleware");

//     next();
// });

//funcionalidades de la aplicacion
app.get("/api/test", authorization.isLoged, async (req, res) => {
  res
    .status(200)
    .send({ status: "Success", message: "API is working correctly" });
});

app.get("/api/users", authorization.isLoged, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: true },
    });
    const decryptedRows = users.map((r) => {
      const decrypted = cryptoUtils.decryptFields(
        r,
        cryptoUtils.USER_SENSITIVE_FIELDS,
      );
      return { ...decrypted, role: r.role?.name ?? "user" };
    });
    return res.status(200).json(decryptedRows);
  } catch (error) {
    console.error("Error fetching users:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to fetch users" });
  }
});

app.get("/api/users/unique-by-location", user.getUniqueUsersByLocation);

app.get("/api/users/info", authorization.isLoged, user.getMyUserInfo);
app.get("/api/users/:id", authorization.isLoged, async (req, res) => {
  const { id } = req.params;
  try {
    const findUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!findUser) {
      return res
        .status(404)
        .json({ status: "Error", message: "User not found" });
    }
    const decrypted = cryptoUtils.decryptFields(
      findUser,
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
    return res
      .status(200)
      .json({ ...decrypted, role: findUser.role?.name ?? "user" });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to fetch user" });
  }
});
app.get("/api/users/:id/info", user.getUserInfo);
app.get("/api/users/:id/public", user.getPublicUserInfo);
app.get("/api/users/:id/profile", user.getPublicUserProfile);
app.post("/api/users/public/batch", user.getPublicUsersBatch);
app.patch("/api/users/:id", authorization.isLoged, user.updateUserPatch);
app.patch("/api/users", authorization.isLoged, user.updateMyUserPatch);

app.delete("/api/users/:id", authorization.isLoged, user.removeUser);

app.get("/", (req, res) => res.sendFile(__dirname + "/pages/login.html"));
app.post("/api/auth/login", authentication.login);
app.get("/api/auth/register/email/:email", authentication.existEmail);
app.post("/api/auth/register", authentication.register);
app.get("/api/auth/logout", authentication.logout);
app.post("/api/auth/refresh", authentication.refresh);
app.get("/api/auth/validate", authentication.validate);
app.post("/api/auth/oauth", authentication.oauthGoogle);
app.post("/api/auth/oauth/android", authentication.oauthGoogleAndroid);

app.post("/api/enterprise/auth/register", (req, res) =>
  enterpriseAuthentication.register(req, res),
);
app.post("/api/enterprise/auth/login", (req, res) =>
  enterpriseAuthentication.login(req, res),
);
app.get("/api/enterprise/auth/logout", (req, res) =>
  enterpriseAuthentication.logout(req, res),
);
app.get("/api/enterprise/auth/validate", (req, res) =>
  enterpriseAuthentication.validate(req, res),
);

app.get(
  "/api/enterprise/me",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterprise.getMe(req, res),
);
app.patch(
  "/api/enterprise/me",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterprise.patchMe(req, res),
);

app.post(
  "/api/enterprise/service-events",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterpriseServiceEvents.create(req, res),
);
app.get(
  "/api/enterprise/service-events",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterpriseServiceEvents.list(req, res),
);
app.get(
  "/api/enterprise/service-events/:id",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterpriseServiceEvents.getById(req, res),
);
app.patch(
  "/api/enterprise/service-events/:id",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterpriseServiceEvents.patch(req, res),
);
app.delete(
  "/api/enterprise/service-events/:id",
  enterpriseAuthorization.isEnterpriseLoged,
  (req, res) => enterpriseServiceEvents.remove(req, res),
);

app.get("/api/auth/oauth/register", async (req, res) => {
  const code = req.query.code;
  const stateRaw = req.query.state;
  // 1. URL de tu frontend (ajusta según tu configuración)
  const successUrl = `${origin}/oauth-callback`;
  const frontendUrl = `${origin}`;
  try {
    let consents = null;
    if (stateRaw) {
      try {
        consents = JSON.parse(
          Buffer.from(stateRaw, "base64").toString("utf-8"),
        );
      } catch {
        consents = null;
      }
    }

    const consentCheck = authentication.validateConsents(consents);
    if (!consentCheck.valid) {
      res.redirect(`${frontendUrl}register?error=consents_required`);
      return;
    }

    const backendRedirectUrl = `${process.env.MY_ORIGIN}api/auth/oauth/register`;
    const oauth2Client = new OAuth2Client(
      client_id,
      secret_id,
      backendRedirectUrl, // Importante para el intercambio de código
    );

    // 2. Intercambio de código por tokens
    const result = await oauth2Client.getToken(code);
    const { tokens } = result;
    await oauth2Client.setCredentials(tokens);
    // 3. Obtener la información del usuario de Google
    const googleUserData = await getUserData(tokens.access_token);

    // 4. (Opcional) Buscar o crear el usuario en tu base de datos
    // ... Lógica para verificar si el usuario existe y obtener 'comprobarUser'
    const comprobarUser = await dbUtils.existUser(googleUserData.email);

    if (comprobarUser) {
      res.redirect(`${frontendUrl}register?error=user_exists`);
      return;
    }

    const userResult = await dbUtils.createUser(
      {
        email: googleUserData.email,
        password: "",
        name: googleUserData.name,
      },
      "google",
      googleUserData.sub,
    );

    if (userResult?.status !== "Success") {
      res.redirect(`${frontendUrl}register?error=auth_failed`);
      return;
    }

    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    await authentication.saveLegalConsents(
      userResult.user.id,
      consents,
      ipAddress,
      userAgent,
    );

    // 5. Generar un Token JWT para la sesión

    const payload = {
      userId: userResult?.user?.id,
      email: googleUserData.email,
      role: userResult?.user?.role?.name ?? "user",
    };
    const jwtToken = jsonwebtoken.sign(payload, PRIVATE_KEY, {
      expiresIn: process.env.EXPIRATION_TIME,
      algorithm: JWT_ALGORITHM,
    });

    // 6. Construir la URL de Redirección con parámetros
    const finalRedirectUrl = `${frontendUrl}register/personal-info?token=${jwtToken}&userId=${encodeURIComponent(String(userResult?.user?.id ?? ""))}&img_perfil=${encodeURIComponent(String(googleUserData.picture ?? ""))}`;
    // 7. Redirigir al frontend
    res.cookie("access_token", jwtToken, {
      expires: new Date(
        Date.now() + process.env.JWT_COOKIES_EXPIRATION_TIME * 60 * 1000,
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 60 * 1000,
    });
    await authentication.issueRefreshToken(res, userResult?.user?.id);
    res.redirect(finalRedirectUrl);
  } catch (error) {
    console.error("Error en el flujo OAuth:", error);

    // En caso de error, redirige al frontend con un mensaje de error
    const errorRedirectUrl = `${frontendUrl}register?error=auth_failed`;
    res.redirect(errorRedirectUrl);
  }
});

app.get("/api/auth/oauth/login", async (req, res) => {
  const code = req.query.code;
  const backendRedirectUrl = `${process.env.MY_ORIGIN}api/auth/oauth/login`; // URL usada en el paso 1
  // 1. URL de tu frontend (ajusta según tu configuración)
  const successUrl = origin;
  console.log();
  const frontendUrl = `${origin}`;
  console.log(frontendUrl);
  const errorUrl = `${origin}login`;
  try {
    const oauth2Client = new OAuth2Client(
      client_id,
      secret_id,
      backendRedirectUrl, // Importante para el intercambio de código
    );

    // 2. Intercambio de código por tokens
    const result = await oauth2Client.getToken(code);
    const { tokens } = result;
    await oauth2Client.setCredentials(tokens);
    // 3. Obtener la información del usuario de Google
    const googleUserData = await getUserData(tokens.access_token);

    // 4. (Opcional) Buscar o crear el usuario en tu base de datos
    // ... Lógica para verificar si el usuario existe y obtener 'comprobarUser'
    const comprobarUser = await dbUtils.getUser(googleUserData.email);

    if (!comprobarUser) {
      res.redirect(`${errorUrl}?error=user_no_exists`);
      return;
    }
    if (comprobarUser.auth_method !== "google") {
      res.redirect(`${errorUrl}?error=auth_method_not_google`);
      return;
    }

    // 5. Generar un Token JWT para la sesión
    const payload = {
      userId: comprobarUser.id,
      email: comprobarUser.email,
      role: comprobarUser.role?.name ?? "user",
    };
    console.log(payload);
    const jwtToken = jsonwebtoken.sign(payload, PRIVATE_KEY, {
      expiresIn: process.env.EXPIRATION_TIME,
      algorithm: JWT_ALGORITHM,
    });
    console.log(jwtToken);

    // 6. Construir la URL de Redirección con parámetros
    const finalRedirectUrl = `${frontendUrl}?token=${jwtToken}&userId=${encodeURIComponent(String(comprobarUser.id ?? ""))}&img_perfil=${encodeURIComponent(String(googleUserData.picture ?? ""))}`;
    // 7. Redirigir al frontend
    console.log(finalRedirectUrl);
    res.cookie("access_token", jwtToken, {
      expires: new Date(
        Date.now() + process.env.JWT_COOKIES_EXPIRATION_TIME * 60 * 1000,
      ),
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 60 * 1000,
    });

    await authentication.issueRefreshToken(res, comprobarUser.id);
    res.redirect(finalRedirectUrl);
  } catch (error) {
    console.error("Error en el flujo OAuth:", error);

    // En caso de error, redirige al frontend con un mensaje de error
    const errorRedirectUrl = `${errorUrl}?error=auth_failed`;
    res.redirect(errorRedirectUrl);
  }
});

app.get("/api/telegram-info", authorization.isLoged, (req, res) =>
  telegramInfo.getAll(req, res),
);
app.get("/api/telegram-info/:id", authorization.isLoged, (req, res) =>
  telegramInfo.getById(req, res),
);
app.post("/api/telegram-info", authorization.isLoged, (req, res) =>
  telegramInfo.create(req, res),
);
app.put("/api/telegram-info/:id", authorization.isLoged, (req, res) =>
  telegramInfo.updatePut(req, res),
);
app.patch("/api/telegram-info/:id", authorization.isLoged, (req, res) =>
  telegramInfo.updatePatch(req, res),
);
app.delete("/api/telegram-info/:id", authorization.isLoged, (req, res) =>
  telegramInfo.remove(req, res),
);
app.post("/api/telegram-info/bulk", authorization.isLoged, (req, res) =>
  telegramInfo.bulkCreate(req, res),
);

//PAYMENTS METHOD
app.post("/api/payment/session", payment.createSession);
app.post(
  "/api/payment/stripe-connect",
  authorization.isLoged,
  payment.createStripeConnectAccount,
);
app.post(
  "/api/payment/stripe-connect-link",
  authorization.isLoged,
  payment.createAccountLink,
);
app.get(
  "/api/payment/stripe-connect-link",
  authorization.isLoged,
  (req, res, next) => {
    req.body = {
      return_url: req.query.return_url,
      refresh_url: req.query.refresh_url,
    };
    payment.createAccountLink(req, res, next);
  },
);
app.get("/api/payment/stripe-redirect", payment.stripeRedirect);
app.get(
  "/api/payment/stripe-connect",
  authorization.isLoged,
  payment.getMyStripeConnectAccount,
);
app.post(
  "/api/payment/stripe-customer",
  authorization.isLoged,
  payment.createStripeCustomer,
);
app.get(
  "/api/payment/stripe-customer",
  authorization.isLoged,
  payment.getMyStripeCustomerAccount,
);
app.post(
  "/api/payment/stripe-link",
  authorization.isLoged,
  payment.createStripeLinkAccount,
);
app.post(
  "/api/payment/stripe-transfer",
  authorization.isLoged,
  payment.createStripeTransfer,
);
app.post(
  "/api/payment/stripe-login-link",
  authorization.isLoged,
  payment.createLoginLink,
);
app.get(
  "/api/payment/stripe-billing-portal",
  authorization.isLoged,
  payment.createBillingPortal,
);
app.get(
  "/api/payment/cash-balance",
  authorization.isLoged,
  payment.getCashBalance,
);
app.get(
  "/api/payment/wallet-balance",
  authorization.isLoged,
  payment.getWalletBalance,
);
app.get(
  "/api/payment/wallet-transactions",
  authorization.isLoged,
  payment.getWalletTransactions,
);
app.post(
  "/api/payment/wallet-payout",
  authorization.isLoged,
  payment.createWalletPayout,
);
app.get(
  "/api/payment/wallet-payouts",
  authorization.isLoged,
  payment.getWalletPayouts,
);
app.get(
  "/api/monedero/cuenta-vinculada",
  authorization.isLoged,
  payment.getLinkedExternalAccounts,
);
app.post(
  "/api/payment/payment-intent",
  authorization.isLoged,
  payment.createPaymentIntent,
);
app.post(
  "/api/payment/payment-intent/checkout",
  authorization.isLoged,
  payment.createCheckoutPaymentIntent,
);
app.post(
  "/api/payment/calculate-price",
  authorization.isLoged,
  payment.calculatePrice,
);
app.get("/api/payment/cotizar", payment.cotizar);
app.post(
  "/api/payment/payment-intent/resume",
  authorization.isLoged,
  payment.resumeCheckoutPaymentIntent,
);
app.post(
  "/api/payment/payment-intent/capture",
  authorization.isLoged,
  payment.capturePaymentIntent,
);
app.post(
  "/api/payment/trayecto/capture",
  authorization.isLoged,
  payment.captureTripPayments,
);
app.post(
  "/api/payment/payment-intent/cancel",
  authorization.isLoged,
  payment.cancelPaymentIntent,
);
app.post("/api/payment/payout", authorization.isLoged, payment.createPayout);
app.post(
  "/api/payment/recharge",
  authorization.isLoged,
  payment.rechargeWalletUser,
);
app.post(
  "/api/payment/bank_account",
  authorization.isLoged,
  payment.createBankAccount,
);

//CARS METHOD
app.post("/api/cars", authorization.isLoged, (req, res) =>
  cars.createCar(req, res),
);
app.put("/api/cars/:id", authorization.isLoged, (req, res) =>
  cars.updateCar(req, res),
);
app.delete("/api/cars/:id", authorization.isLoged, (req, res) =>
  cars.removeCar(req, res),
);
app.get("/api/cars/:id", authorization.isLoged, (req, res) =>
  cars.getCar(req, res),
);
//DISPONIBILIDAD_SEMANAL
// app.get("/api/routines", authorization.isLoged, (req, res) => disponibilidad_semanal.getAll(req, res))
app.get("/api/routines/:id", authorization.isLoged, (req, res) =>
  disponibilidad_semanal.getDisponibilidad(req, res),
);
app.post("/api/routines", authorization.isLoged, (req, res) =>
  disponibilidad_semanal.createDisponibilidad(req, res),
);
app.put("/api/routines/:id", authorization.isLoged, (req, res) =>
  disponibilidad_semanal.updateDisponibilidad(req, res),
);
app.patch("/api/routines/:id", authorization.isLoged, (req, res) =>
  disponibilidad_semanal.updateDisponibilidad(req, res),
);
app.delete("/api/routines/:id", authorization.isLoged, (req, res) =>
  disponibilidad_semanal.removeDisponibilidad(req, res),
);
app.get("/api/cars/user/:userId", authorization.isLoged, (req, res) =>
  cars.getCarsByUserId(req, res),
);

app.get("/api/routines/user/:userId", authorization.isLoged, (req, res) =>
  disponibilidad_semanal.getDisponibilidadesByUserId(req, res),
);
app.get(
  "/api/routines/user/:userId/finalidad/:finalidad",
  authorization.isLoged,
  (req, res) =>
    disponibilidad_semanal.getDisponibilidadesByUserIdAndFinalidad(req, res),
);

// --- Events ---
app.get("/api/events", events.getAllEvents);
app.get("/api/events/nearby", events.getNearbyEvents);
app.get(
  "/api/events/me/joined",
  authorization.isLoged,
  events.getMyJoinedEvents,
);
app.get("/api/events/code/:code", authorization.isLoged, events.getEventByCode);
app.get("/api/events/:id", events.getEventById);
app.post("/api/events", authorization.isLoged, events.createEvent);
app.patch("/api/events/:id", authorization.onlyAdmin, events.updateEvent);
app.delete("/api/events/:id", authorization.onlyAdmin, events.deleteEvent);
app.post("/api/events/:id/join", authorization.isLoged, events.joinEvent);
app.delete("/api/events/:id/join", authorization.isLoged, events.leaveEvent);
app.get(
  "/api/events/:id/participants",
  authorization.isLoged,
  events.getEventParticipants,
);

// --- CAE Reports ---
app.get(
  "/api/cae-reports/summary",
  authorization.onlyAdmin,
  caeReports.getReportsSummary,
);
app.get("/api/cae-reports", authorization.onlyAdmin, caeReports.listReports);
app.post("/api/cae-reports", authorization.onlyAdmin, caeReports.createReport);
app.get(
  "/api/cae-reports/:id",
  authorization.onlyAdmin,
  caeReports.getReportById,
);
app.patch(
  "/api/cae-reports/:id/status",
  authorization.onlyAdmin,
  caeReports.updateReportStatus,
);
app.delete(
  "/api/cae-reports/:id",
  authorization.onlyAdmin,
  caeReports.deleteReport,
);
app.get(
  "/api/cae-reports/:id/export",
  authorization.onlyAdmin,
  caeReports.exportReportExcel,
);

// --- Tags ---
app.get("/api/tags", authorization.isLoged, events.getAllTags);
app.post("/api/tags", authorization.onlyAdmin, events.createTag);
app.delete("/api/tags/:id", authorization.onlyAdmin, events.deleteTag);

// --- Companies ---
app.get("/api/companies", authorization.isLoged, (req, res) =>
  companies.getAllCompanies(req, res),
);
app.get("/api/companies/:id", authorization.isLoged, (req, res) =>
  companies.getCompanyById(req, res),
);
app.post("/api/companies", authorization.onlyAdmin, (req, res) =>
  companies.createCompany(req, res),
);
app.patch("/api/companies/:id", authorization.onlyAdmin, (req, res) =>
  companies.updateCompany(req, res),
);
app.delete("/api/companies/:id", authorization.onlyAdmin, (req, res) =>
  companies.deleteCompany(req, res),
);

// --- Promoter Suggestions ---
app.get(
  "/api/suggestions",
  authorization.onlyAdmin,
  suggestions.listSuggestions,
);
app.get(
  "/api/suggestions/:id",
  authorization.onlyAdmin,
  suggestions.getSuggestionById,
);
app.post(
  "/api/suggestions",
  authorization.isLoged,
  suggestions.createSuggestion,
);
app.patch(
  "/api/suggestions/:id",
  authorization.onlyAdmin,
  suggestions.updateSuggestion,
);
app.delete(
  "/api/suggestions/:id",
  authorization.onlyAdmin,
  suggestions.deleteSuggestion,
);
app.post(
  "/api/suggestions/:id/accept",
  authorization.onlyAdmin,
  suggestions.acceptSuggestion,
);

// --- Legal Consents ---
app.get("/api/legal-consents", authorization.onlyAdmin, (req, res) =>
  legalConsent.getAllConsents(req, res),
);
app.get("/api/legal-consents/summary", authorization.onlyAdmin, (req, res) =>
  legalConsent.getConsentSummary(req, res),
);
app.get(
  "/api/legal-consents/without/:documentType",
  authorization.onlyAdmin,
  (req, res) => legalConsent.getUsersWithoutConsent(req, res),
);
app.get(
  "/api/legal-consents/user/:userId",
  authorization.onlyAdmin,
  (req, res) => legalConsent.getConsentsByUser(req, res),
);
app.get("/api/legal-consents/me", authorization.isLoged, (req, res) =>
  legalConsent.getMyConsents(req, res),
);

app.use((req, res, next) => {
  next(
    new AppError(
      `No se puede encontrar la ruta ${req.originalUrl} en este servidor`,
      404,
      "ROUTE_NOT_FOUND",
    ),
  );
});

app.use(errorHandler);

export default app;
