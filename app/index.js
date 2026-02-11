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
import db from "./database.js";
import { methods as user } from "./controllers/user.js";
import { methods as webhook } from "./controllers/webhook.js";
import { methods as disponibilidad_semanal } from "./controllers/disponibilidad_semanal.js";
import { methods as payment } from "./controllers/payment.js";
import { methods as cars } from "./controllers/cars.js";
import { enterpriseAuthorization } from "./middlewares/enterpriseAuthorization.js";
import { methods as enterpriseAuthentication } from "./controllers/enterprise_authentication.js";
import { methods as enterprise } from "./controllers/enterprise.js";
import { methods as enterpriseServiceEvents } from "./controllers/enterprise_service_events.js";
import { OAuth2Client } from "google-auth-library";
import { getUserData } from "./providers/google-auth.js";
import jsonwebtoken from "jsonwebtoken";
import { methods as dbUtils } from "./utils/db.js";
dotenv.config();
//Configuracion del servidor
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let origin = process.env.ORIGIN;
origin = origin[origin.length - 1] !== "/" ? origin + "/" : origin;
let origin_without =
  origin[origin.length - 1] === "/" ? origin.slice(0, -1) : origin;
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
      "http://localhost:4001",
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

try {
  await db.execute("PRAGMA foreign_keys = ON");
} catch (_e) { }

if (process.env.RESET_DB === "1") {
  try {
    await db.execute("PRAGMA foreign_keys = OFF");
  } catch (_e) { }
  try {
    await db.execute("DROP TABLE IF EXISTS telegram_info");
  } catch (_e) { }
  try {
    await db.execute("DROP TABLE IF EXISTS disponibilidad_semanal");
  } catch (_e) { }
  try {
    await db.execute("DROP TABLE IF EXISTS cars");
  } catch (_e) { }
  try {
    await db.execute("DROP TABLE IF EXISTS comments");
  } catch (_e) { }
  try {
    await db.execute("DROP TABLE IF EXISTS accounts");
  } catch (_e) { }
  try {
    await db.execute("DROP TABLE IF EXISTS users");
  } catch (_e) { }
  try {
    await db.execute("PRAGMA foreign_keys = ON");
  } catch (_e) { }
}

await db.execute(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NULL,
    img_perfil TEXT,
    name TEXT,
    phone TEXT,
    fecha_nacimiento TEXT NULL, -- store as ISO string (YYYY-MM-DD)
    dni TEXT NULL UNIQUE,
    genero TEXT NULL CHECK (genero IN ('Masculino','Femenino','Otro')),
    stripe_account TEXT,
    stripe_customer_account TEXT,
    ciudad TEXT NULL,
    provincia TEXT NULL,
    codigo_postal TEXT NULL,
    direccion TEXT NULL ,
    pais TEXT NULL,
    onboarding_ended INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
    about_me TEXT,
    auth_method TEXT CHECK (auth_method IN ('password', 'google', 'other')) NOT NULL DEFAULT 'password',
    google_id TEXT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
  `);
await db.execute(`
CREATE TABLE IF NOT EXISTS accounts (
  stripe_account_id TEXT PRIMARY KEY NOT NULL,
  default_account INTEGER DEFAULT 0,
  user_id INTEGER NOT NULL,
  charges_enabled INTEGER NOT NULL DEFAULT 0,
  transfers_enabled INTEGER NOT NULL DEFAULT 0,
  details_submitted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
`);
await db.execute(`
CREATE TABLE IF NOT EXISTS comments (
    -- 1. Clave primaria con autoincremento
    id_comment INTEGER PRIMARY KEY AUTOINCREMENT, 
    
    -- 2. Tipos de datos más genéricos
    id_trayecto INTEGER NOT NULL,
    user_id_commentator INTEGER NOT NULL,
    user_id_trayect INTEGER NOT NULL,
    opinion TEXT NOT NULL,
    rating INTEGER NOT NULL,
    
    -- 3. Restricción CHECK
    CONSTRAINT chk_opinion_rating CHECK (rating >= 1 AND rating <= 10),
    
    -- 4. Claves foráneas (SQLite las maneja de forma diferente, pero la sintaxis es similar)
    FOREIGN KEY (id_trayecto) REFERENCES trayectos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (user_id_commentator) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (user_id_trayect) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    
    -- 5. Restricción UNIQUE (el nombre se elimina o se simplifica, se puede omitir el "KEY")
    UNIQUE (id_trayecto, user_id_commentator)
);
`);

await db.execute(`
CREATE TABLE IF NOT EXISTS cars (
  id_coche INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  color TEXT NULL,
  tipo_combustible TEXT NOT NULL,
  num_plazas INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (matricula),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await db.execute(`
CREATE TABLE IF NOT EXISTS disponibilidad_semanal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  dia_semana TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  transport_needed INTEGER NOT NULL DEFAULT 0,
  transporte TEXT NULL,
  estado TEXT NOT NULL,
  finalidad TEXT NOT NULL,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await db.execute(`
CREATE TABLE IF NOT EXISTS telegram_info (
  user_id INTEGER NOT NULL,
  id INTEGER PRIMARY KEY,
  username_telegram TEXT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NULL,
  chat_id INTEGER NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await db.execute(`
CREATE TABLE IF NOT EXISTS events (
id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 1. Clave primaria con TEXT
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT NULL,
  -- 2. JSON se convierte a TEXT
  data TEXT NOT NULL,
  
  -- 3. Cadenas de texto
  source TEXT NOT NULL,
  processing_error TEXT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  
  -- Nota: Las restricciones UNIQUE en la clave primaria son redundantes en SQLite
);

`);

try {
  await db.execute("ALTER TABLE events ADD COLUMN event_type TEXT");
} catch (_e) { }
try {
  await db.execute("ALTER TABLE events ADD COLUMN payment_intent_id TEXT");
} catch (_e) { }
try {
  await db.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id)",
  );
} catch (_e) { }

await db.execute(`
CREATE TABLE IF NOT EXISTS enterprises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT NULL,
  cif TEXT NULL UNIQUE,
  website TEXT NULL,
  address_line1 TEXT NULL,
  address_line2 TEXT NULL,
  city TEXT NULL,
  province TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NOT NULL DEFAULT 'ES',
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
`);
await db
  .execute({
    sql: "ALTER TABLE service_events ADD COLUMN enterprise_id INTEGER",
    args: [],
  })
  .catch(() => { });
await db.execute(`
CREATE TABLE IF NOT EXISTS service_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enterprise_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('draft','requested','approved','rejected','canceled','completed')),
  venue_name TEXT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT NULL,
  city TEXT NOT NULL,
  province TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NOT NULL DEFAULT 'ES',
  latitude REAL NULL,
  longitude REAL NULL,
  contact_name TEXT NULL,
  contact_email TEXT NULL,
  contact_phone TEXT NULL,
  attendees_estimate INTEGER NULL CHECK (attendees_estimate IS NULL OR attendees_estimate >= 0),
  notes TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (enterprise_id) REFERENCES enterprises(id) ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await db.execute(`
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (user_id, currency)
);
  `);
await db.execute(`
CREATE TABLE IF NOT EXISTS wallet_recharges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','canceled','expired')),
  stripe_checkout_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT NULL,
  stripe_event_id TEXT NULL,
  stripe_payment_status TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (stripe_checkout_session_id),
  UNIQUE (stripe_event_id)
);
  `);
await db.execute(`
CREATE TABLE IF NOT EXISTS payment_intents (
    stripe_payment_id TEXT UNIQUE PRIMARY KEY,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency IN ('eur', 'usd', 'gbp', 'jpy', 'aud')),
    description TEXT NULL,
    destination_account TEXT NULL,
    sender_account TEXT NULL,
    state TEXT NOT NULL,
    client_secret TEXT NULL,
    checkout_session_id TEXT NULL,
    id_reserva TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (sender_account) REFERENCES accounts(stripe_account_id) ON DELETE CASCADE ON UPDATE CASCADE
);
  `);
await db.execute(`
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  id_reserva TEXT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit','reservation_payment','reservation_revenue','commision','refund','refund_reversal', 'adjustment')),
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT NULL,
  stripe_payment_intent_id TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (stripe_payment_intent_id) REFERENCES payment_intents(stripe_payment_id) ON DELETE CASCADE ON UPDATE CASCADE
);
  `);
await db.execute(`
CREATE TABLE IF NOT EXISTS wallet_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_account_id INTEGER NOT NULL,
  wallet_transaction_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed','canceled')),
  method TEXT NOT NULL DEFAULT 'standard' CHECK (method IN ('standard','instant')),
  idempotency_key TEXT NOT NULL,
  stripe_payout_id TEXT NULL,
  stripe_payout_status TEXT NULL,
  stripe_event_id TEXT NULL,
  failure_reason TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (idempotency_key),
  UNIQUE (stripe_payout_id),
  UNIQUE (stripe_event_id)
);
  `);

try {
  await db.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_checkout_session_id ON payment_intents(checkout_session_id)",
  );
} catch (_e) { }
try {
  await db.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_stripe_payment_id ON payment_intents(stripe_payment_id)",
  );
} catch (_e) { }

//funcionalidades de la aplicacion
app.get("/api/test", authorization.isLoged, async (req, res) => {
  res
    .status(200)
    .send({ status: "Success", message: "API is working correctly" });
});

app.get("/api/users", authorization.isLoged, async (req, res) => {
  try {
    const resultado = await db.execute("SELECT * FROM users");
    const rows = Array.isArray(resultado?.[0]) ? resultado[0] : resultado?.rows;
    const decryptedRows = (rows ?? []).map((r) =>
      cryptoUtils.decryptFields(r, cryptoUtils.USER_SENSITIVE_FIELDS),
    );
    return res.status(200).json(decryptedRows); // El resultado es un array, así que devolvemos el primer elemento
  } catch (error) {
    console.error("Error fetching users:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to fetch users" });
  }
});

app.get("/api/users/info", authorization.isLoged, (req, res) =>
  user.getMyUserInfo(req, res),
);
app.get("/api/users/:id", authorization.isLoged, async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [id],
    });
    if (resultado.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "Error", message: "User not found" });
    }
    const user = cryptoUtils.decryptFields(
      resultado.rows[0],
      cryptoUtils.USER_SENSITIVE_FIELDS,
    );
    return res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to fetch user" });
  }
});
app.get("/api/users/:id/info", (req, res) => user.getUserInfo(req, res));
app.patch("/api/users/:id", authorization.isLoged, (req, res) =>
  user.updateUserPatch(req, res),
);
app.patch("/api/users", authorization.isLoged, (req, res) =>
  user.updateMyUserPatch(req, res),
);

app.delete("/api/users/:id", authorization.isLoged, (req, res) =>
  user.removeUser(req, res),
);

app.get("/", (req, res) => res.sendFile(__dirname + "/pages/login.html"));
app.post("/api/auth/login", (req, res) => authentication.login(req, res));
app.get("/api/auth/register/email/:email", (req, res) =>
  authentication.existEmail(req, res),
);
app.post("/api/auth/register", (req, res) => authentication.register(req, res));
app.get("/api/auth/logout", (req, res) => authentication.logout(req, res));
app.post("/api/auth/refresh", (req, res) => authentication.refresh(req, res));
app.get("/api/auth/validate", (req, res) => authentication.validate(req, res));
app.post("/api/auth/oauth", (req, res) => authentication.oauthGoogle(req, res));

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
  const backendRedirectUrl = `${process.env.MY_ORIGIN}api/auth/oauth/register`; // URL usada en el paso 1
  // 1. URL de tu frontend (ajusta según tu configuración)
  const successUrl = `${origin}/oauth-callback`;
  const frontendUrl = `${origin}`;
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

    // 5. Generar un Token JWT para la sesión

    const payload = {
      userId: userResult?.user?.id,
      email: googleUserData.email,
    };
    const jwtToken = jsonwebtoken.sign(payload, process.env.JWT_SECRET_KEY, {
      expiresIn: process.env.EXPIRATION_TIME,
    });

    // 6. Construir la URL de Redirección con parámetros
    const finalRedirectUrl = `${frontendUrl}register/personal-info?token=${jwtToken}&userId=${encodeURIComponent(String(userResult?.user?.id ?? ""))}&img_perfil=${encodeURIComponent(String(googleUserData.picture ?? ""))}`;
    // 7. Redirigir al frontend
    res.cookie("access_token", jwtToken, {
      expires: new Date(
        Date.now() +
        process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
    });
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
  const frontendUrl = `${origin}`;
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
    };
    const jwtToken = jsonwebtoken.sign(payload, process.env.JWT_SECRET_KEY, {
      expiresIn: process.env.EXPIRATION_TIME,
    });

    // 6. Construir la URL de Redirección con parámetros
    const finalRedirectUrl = `${frontendUrl}?token=${jwtToken}&userId=${encodeURIComponent(String(comprobarUser.id ?? ""))}&img_perfil=${encodeURIComponent(String(googleUserData.picture ?? ""))}`;
    // 7. Redirigir al frontend
    res.cookie("access_token", jwtToken, {
      expires: new Date(
        Date.now() +
        process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
      ),
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
    });

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

app.post("/api/webhook/:source", (req, res) => webhook.createEvent(req, res));

//PAYMENTS METHOD
app.post("/api/payment/session", (req, res) => payment.createSession(req, res));
app.post("/api/payment/stripe-connect", authorization.isLoged, (req, res) =>
  payment.createStripeConnectAccount(req, res),
);
app.get("/api/payment/stripe-connect-link", authorization.isLoged, (req, res) =>
  payment.createAccountLink(req, res),
);
app.get("/api/payment/stripe-connect", authorization.isLoged, (req, res) =>
  payment.getMyStripeConnectAccount(req, res),
);
// app.get("/api/payment/stripe-connect/:stripe_account_id", authorization.isLoged, (req, res) => payment.getMyStripeConnectAccount(req, res))
app.post("/api/payment/stripe-customer", authorization.isLoged, (req, res) =>
  payment.createStripeCustomer(req, res),
);
app.get("/api/payment/stripe-customer", authorization.isLoged, (req, res) =>
  payment.getMyStripeCustomerAccount(req, res),
);
app.post("/api/payment/stripe-link", authorization.isLoged, (req, res) =>
  payment.createStripeLinkAccount(req, res),
);
app.post("/api/payment/stripe-transfer", authorization.isLoged, (req, res) =>
  payment.createStripeTransfer(req, res),
);
app.post("/api/payment/stripe-login-link", authorization.isLoged, (req, res) =>
  payment.createLoginLink(req, res),
);
app.get(
  "/api/payment/stripe-billing-portal",
  authorization.isLoged,
  (req, res) => payment.createBillingPortal(req, res),
);
app.get("/api/payment/cash-balance", authorization.isLoged, (req, res) =>
  payment.getCashBalance(req, res),
);
app.get("/api/payment/wallet-balance", authorization.isLoged, (req, res) =>
  payment.getWalletBalance(req, res),
);
app.get("/api/payment/wallet-transactions", authorization.isLoged, (req, res) =>
  payment.getWalletTransactions(req, res),
);
app.post("/api/payment/wallet-payout", authorization.isLoged, (req, res) =>
  payment.createWalletPayout(req, res),
);
app.get("/api/payment/wallet-payouts", authorization.isLoged, (req, res) =>
  payment.getWalletPayouts(req, res),
);
app.post("/api/payment/payment-intent", authorization.isLoged, (req, res) =>
  payment.createPaymentIntent(req, res),
);
app.post(
  "/api/payment/payment-intent/checkout",
  authorization.isLoged,
  (req, res) => payment.createCheckoutPaymentIntent(req, res),
);
app.post(
  "/api/payment/payment-intent/capture",
  authorization.isLoged,
  (req, res) => payment.capturePaymentIntent(req, res),
);
app.post(
  "/api/payment/payment-intent/cancel",
  authorization.isLoged,
  (req, res) => payment.cancelPaymentIntent(req, res),
);
app.post("/api/payment/payout", authorization.isLoged, (req, res) =>
  payment.createPayout(req, res),
);
app.post("/api/payment/recharge", authorization.isLoged, (req, res) =>
  payment.rechargeWalletUser(req, res),
);
app.post("/api/payment/bank_account", authorization.isLoged, (req, res) =>
  payment.createBankAccount(req, res),
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

app.use((req, res) => {
  res.status(404).sendFile(__dirname + "/pages/404.html");
});

export default app;
