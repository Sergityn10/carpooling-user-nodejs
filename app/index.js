import express from "express"
import path from "path"
import z from "zod"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import cors from "cors"
import { authorization } from "./middlewares/authorization.js"
import { fileURLToPath } from "url"
import {methods as authentication} from "./controllers/authentication.js"
import { TelegramInfoServices as telegramInfo } from "./controllers/telegramInfo.js"
import db from "./database.js"
import {methods as user} from "./controllers/user.js"
import {methods as webhook} from "./controllers/webhook.js"
import {methods as disponibilidad_semanal} from "./controllers/disponibilidad_semanal.js"
import { methods as payment } from "./controllers/payment.js"
import {methods as cars} from "./controllers/cars.js"
import { OAuth2Client } from "google-auth-library"
import { getUserData } from "./providers/google-auth.js"
import jsonwebtoken from "jsonwebtoken"
import { methods as dbUtils } from "./utils/db.js"
dotenv.config()
//Configuracion del servidor
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const origin = process.env.ORIGIN
const app = express()
app.disable("x-powered-by") // Desactiva el encabezado x-powered-by
app.set("port",4000)
app.listen(app.get("port"), () => {
    console.log("Servidor iniciado en el puerto " + app.get("port"))
})

const client_id = process.env.GOOGLE_CLIENT_ID
const secret_id = process.env.GOOGLE_OAUTH

//Configuracion de la carpeta de archivos estaticos
app.use(express.static(__dirname + "\\public"))
app.use(morgan("dev")) // Middleware para registrar las peticiones HTTP en la consola
app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin: ["http://localhost:5173", "http://192.168.0.36:5173", origin, "*"], // Cambia esto a la URL de tu frontend
    methods: "GET,POST,PUT,PATCH,DELETE",
    credentials: true // Permite el uso de cookies
}))


// Middleware
// app.use((req, res, next) => {
//     console.log("Mi primer middleware");

//     next();
// });

 await db.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
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
    onboarding_ended INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
    about_me TEXT,
    auth_method TEXT CHECK (auth_method IN ('password', 'google', 'other')) NOT NULL DEFAULT 'password',
    google_id TEXT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
`);
await db.execute(`
CREATE TABLE IF NOT EXISTS comments (
    -- 1. Clave primaria con autoincremento
    id_comment INTEGER PRIMARY KEY AUTOINCREMENT, 
    
    -- 2. Tipos de datos más genéricos
    id_trayecto INTEGER NOT NULL,
    username_commentator TEXT NOT NULL,
    username_trayect TEXT NOT NULL,
    opinion TEXT NOT NULL,
    rating INTEGER NOT NULL,
    
    -- 3. Restricción CHECK
    CONSTRAINT chk_opinion_rating CHECK (rating >= 1 AND rating <= 10),
    
    -- 4. Claves foráneas (SQLite las maneja de forma diferente, pero la sintaxis es similar)
    FOREIGN KEY (id_trayecto) REFERENCES trayectos(id),
    FOREIGN KEY (username_commentator) REFERENCES users(username),
    FOREIGN KEY (username_trayect) REFERENCES users(username),
    
    -- 5. Restricción UNIQUE (el nombre se elimina o se simplifica, se puede omitir el "KEY")
    UNIQUE (id_trayecto, username_commentator)
);
`);
await db.execute(`
CREATE TABLE IF NOT EXISTS events (
  -- 1. Clave primaria con TEXT
  event_id TEXT PRIMARY KEY NOT NULL,
  
  -- 2. JSON se convierte a TEXT
  data TEXT NOT NULL,
  
  -- 3. Cadenas de texto
  source TEXT NOT NULL,
  processing_error TEXT NULL,
  status TEXT NOT NULL
  
  -- Nota: Las restricciones UNIQUE en la clave primaria son redundantes en SQLite
);

`);

await db.execute(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
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
    onboarding_ended INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
    about_me TEXT,
    auth_method TEXT CHECK (auth_method IN ('password', 'google', 'other')) NOT NULL DEFAULT 'password',
    google_id TEXT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
  `)


//funcionalidades de la aplicacion
app.get("/api/test",authorization.isLoged, async (req, res) => {
    res.status(200).send({status: "Success", message: "API is working correctly"})
})

app.get("/api/users", authorization.isLoged, async (req, res) => {
    try {
        const resultado = await db.execute("SELECT * FROM users");
        return res.status(200).json(resultado[0]); // El resultado es un array, así que devolvemos el primer elemento
    } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ status: "Error", message: "Failed to fetch users" });
    }
});

app.get("/api/users/info", authorization.isLoged, (req, res) => user.getMyUserInfo(req, res))
app.get("/api/users/:id", authorization.isLoged, async (req, res) => {
    const { id } = req.params;
    try {
        const resultado = await db.execute({
            sql: "SELECT * FROM users WHERE username = ?",
            args: [id]
        });
        if (resultado.rows.length === 0) {
            return res.status(404).json({ status: "Error", message: "User not found" });
        }
        return res.status(200).json(resultado[0][0]);
    } catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({ status: "Error", message: "Failed to fetch user" });
    }
});
app.get("/api/users/:username/info", (req, res) => user.getUserInfo(req, res))


app.patch("/api/users/:username", authorization.isLoged, (req, res) => user.updateUserPatch(req, res))
app.patch("/api/users", authorization.isLoged, (req, res) => user.updateMyUserPatch(req, res))

app.delete("/api/users/:username", authorization.isLoged, (req, res) => user.removeUser(req, res))

app.get("/",(req, res)=> res.sendFile(__dirname + "/pages/login.html"))
app.post("/api/auth/login",(req, res)=> authentication.login(req, res))
app.get("/api/auth/register/email/:email", (req, res) => authentication.existEmail(req, res))
app.post("/api/auth/register",(req, res)=> authentication.register(req, res))
app.get("/api/auth/logout",(req, res)=> authentication.logout(req, res))
app.post("/api/auth/refresh",(req, res)=> authentication.refresh(req, res))
app.get("/api/auth/validate",(req, res)=> authentication.validate(req, res))
app.post("/api/auth/oauth", (req, res) => authentication.oauthGoogle(req, res))

app.get('/api/auth/oauth/userInfo', async (req, res) => {
    const code = req.query.code;
    const backendRedirectUrl = 'http://localhost:4000/api/auth/oauth/userInfo'; // URL usada en el paso 1
    
    // 1. URL de tu frontend (ajusta según tu configuración)
    const frontendUrl = "http://localhost:5173/oauth-callback"; 

    try{
        const oauth2Client = new OAuth2Client(
            client_id,
            secret_id,
            backendRedirectUrl // Importante para el intercambio de código
        );
        
        // 2. Intercambio de código por tokens
        const result = await oauth2Client.getToken(code);
        const { tokens } = result;
        await oauth2Client.setCredentials(tokens);
        // 3. Obtener la información del usuario de Google
        const googleUserData = await getUserData(tokens.access_token);
        
        // 4. (Opcional) Buscar o crear el usuario en tu base de datos
        // ... Lógica para verificar si el usuario existe y obtener 'comprobarUser'
        console.log(googleUserData)
        const comprobarUser = await dbUtils.existUser(googleUserData.email);

        if(comprobarUser){
            return res.status(400).send({status: "Error", message: "User already exists"});
        }
        const username = dbUtils.createUsername(googleUserData.name)
        const userResult = await dbUtils.createUser({
                 username,
                 email: googleUserData.email,
                 password: '',
                 name: googleUserData.name
             }, 'google', googleUserData.sub);
        
        // 5. Generar un Token JWT para la sesión
        
        const payload = {
            username: googleUserData.name, // O el nombre de usuario de tu DB
            email: googleUserData.email
        };
        const jwtToken = jsonwebtoken.sign(payload, process.env.JWT_SECRET_KEY, {
            expiresIn: process.env.EXPIRATION_TIME
        });

        // 6. Construir la URL de Redirección con parámetros
        const finalRedirectUrl = `${frontendUrl}?token=${jwtToken}&username=${googleUserData.email}&img_perfil=${googleUserData.picture}`;
        // 7. Redirigir al frontend
        res.cookie("access_token", jwtToken, {
            expires: new Date(Date.now() +  process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
        });
        res.redirect(finalRedirectUrl);

    }
    catch(error){
        console.error("Error en el flujo OAuth:", error);
        
        // En caso de error, redirige al frontend con un mensaje de error
        const errorRedirectUrl = `${frontendUrl}?error=auth_failed`;
        res.redirect(errorRedirectUrl);
    }
});

app.get("/api/telegram-info", authorization.isLoged, (req, res) => telegramInfo.getAll(req, res))
app.get("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.getById(req, res))
app.post("/api/telegram-info", authorization.isLoged, (req, res) => telegramInfo.create(req, res))
app.put("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.updatePut(req, res))
app.patch("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.updatePatch(req, res))
app.delete("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.remove(req, res))
app.post("/api/telegram-info/bulk", authorization.isLoged, (req, res) => telegramInfo.bulkCreate(req, res))

app.post("/api/webhook/:source", (req, res) => webhook.createEvent(req, res))

//PAYMENTS METHOD
app.post("/api/payment/session", (req, res) => payment.createSession(req, res))
app.post("/api/payment/stripe-connect", authorization.isLoged, (req, res) => payment.createStripeConnectAccount(req, res))
app.get("/api/payment/stripe-connect", authorization.isLoged, (req, res) => payment.getMyStripeConnectAccount(req, res))
// app.get("/api/payment/stripe-connect/:stripe_account_id", authorization.isLoged, (req, res) => payment.getMyStripeConnectAccount(req, res))
app.post("/api/payment/stripe-customer", authorization.isLoged, (req, res) => payment.createStripeCustomer(req, res))
app.get("/api/payment/stripe-customer", authorization.isLoged, (req, res) => payment.getMyStripeCustomerAccount(req, res))
app.post("/api/payment/stripe-link", authorization.isLoged, (req, res) => payment.createStripeLinkAccount(req, res))
app.post("/api/payment/stripe-transfer", authorization.isLoged, (req, res) => payment.createStripeTransfer(req, res))
app.post("/api/payment/stripe-login-link", authorization.isLoged, (req, res) => payment.createLoginLink(req, res))
app.get("/api/payment/stripe-billing-portal", authorization.isLoged, (req, res) => payment.createBillingPortal(req, res))
app.get("/api/payment/cash-balance", authorization.isLoged, (req, res) => payment.getCashBalance(req, res))
app.post("/api/payment/payment-intent", authorization.isLoged, (req, res) => payment.createPaymentIntent(req, res))
app.post("/api/payment/payment-intent/checkout", authorization.isLoged, (req, res) => payment.createCheckoutPaymentIntent(req, res))
app.get("/api/payment/payment-intent/capture/:paymentIntentId", authorization.isLoged, (req, res) => payment.capturePaymentIntent(req, res))
app.post("/api/payment/payout", authorization.isLoged, (req, res) => payment.createPayout(req, res))
app.post("/api/payment/bank_account", authorization.isLoged, (req, res) => payment.createBankAccount(req, res))

//CARS METHOD
app.post("/api/cars", authorization.isLoged, (req, res) => cars.createCar(req, res))
app.put("/api/cars/:id", authorization.isLoged, (req, res) => cars.updateCar(req, res))
app.delete("/api/cars/:id", authorization.isLoged, (req, res) => cars.removeCar(req, res))
app.get("/api/cars/username/:username", authorization.isLoged, (req, res) => cars.getCarsByUsername(req, res))
app.get("/api/cars/:id", authorization.isLoged, (req, res) => cars.getCar(req, res))
//DISPONIBILIDAD_SEMANAL
// app.get("/api/routines", authorization.isLoged, (req, res) => disponibilidad_semanal.getAll(req, res))
app.get("/api/routines/:id", authorization.isLoged, (req, res) => disponibilidad_semanal.getDisponibilidad(req, res))
app.post("/api/routines", authorization.isLoged, (req, res) => disponibilidad_semanal.createDisponibilidad(req, res))
app.put("/api/routines/:id", authorization.isLoged, (req, res) => disponibilidad_semanal.updateDisponibilidad(req, res))
app.patch("/api/routines/:id", authorization.isLoged, (req, res) => disponibilidad_semanal.updateDisponibilidad(req, res))
app.delete("/api/routines/:id", authorization.isLoged, (req, res) => disponibilidad_semanal.removeDisponibilidad(req, res))
app.get("/api/routines/username/:username", authorization.isLoged, (req, res) => disponibilidad_semanal.getDisponibilidadesByUsername(req, res))
app.get("/api/routines/username/:username/finalidad/:finalidad", authorization.isLoged, (req, res) => disponibilidad_semanal.getDisponibilidadesByUsernameAndFinalidad(req, res))

app.use((req, res) => {
    res.status(404).sendFile(__dirname + "/pages/404.html");
})

