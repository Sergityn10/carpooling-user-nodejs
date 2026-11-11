import express from "express";
import path from "path";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import errorHandler from "./middlewares/errorHandler.js";
import AppError from "./utils/appError.js";
import { generalApiLimiter } from "./middlewares/rateLimiter.js";
import { paymentEventHandler } from "./services/paymentEventHandler.js";
import { autoCaptureService } from "./services/autoCaptureService.js";
import webhookRoutes from "./routes/webhook.js";
import apiRoutes from "./routes/index.js";

dotenv.config();
void env;

// Configuración del servidor
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawOrigin = process.env.ORIGIN || "";
const origin = rawOrigin
  ? rawOrigin.endsWith("/")
    ? rawOrigin
    : `${rawOrigin}/`
  : "";
const origin_without = rawOrigin
  ? rawOrigin.endsWith("/")
    ? rawOrigin.slice(0, -1)
    : rawOrigin
  : "";
if (origin) console.log(origin);
if (origin_without) console.log(origin_without);

const trayectos_origin = process.env.TRAYECTOS_ORIGIN;
const messsages_origin = process.env.MESSSAGES_ORIGIN;

const app = express();
app.disable("x-powered-by"); // Desactiva el encabezado x-powered-by
app.set("port", process.env.PORT ?? 4000);

if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "test") {
  app.listen(app.get("port"), () => {
    console.log("Servidor iniciado en el puerto " + app.get("port"));
  });
}

// Configuración de la carpeta de archivos estáticos y seguridad
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1); // <--- ESTO ES VITAL EN VERCEL
app.use(helmet({ crossOriginResourcePolicy: false }));

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:4001",
    "http://localhost:3000",
    "https://www.youconnext.es",
    "https://app.youconnext.es",
    "https://admin.youconnext.es",
    "https://youconnext-nextjs.vercel.app",
    "https://carpooling-webapp-ten.vercel.app",
    "https://youconnext-landing-page.vercel.app",
    origin,
    origin_without,
    trayectos_origin,
    messsages_origin,
  ].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

app.use(morgan("dev")); // Middleware para registrar las peticiones HTTP en la consola
app.use("/api/", generalApiLimiter);

// Stripe webhooks necesitan el raw body antes del parser JSON global
app.use("/api/webhook", webhookRoutes);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "10mb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.JSON_BODY_LIMIT ?? "10mb",
  }),
);
app.use(cookieParser());

// Endpoint de salud y diagnóstico de disponibilidad (Healthcheck para K8s / PM2 / Uptime monitors)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "carpooling-user",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
  });
});

app.get("/", (req, res) => res.sendFile(__dirname + "/pages/login.html"));

// Rutas modulares de la API
app.use("/api", apiRoutes);

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

if (process.env.NODE_ENV !== "test") {
  paymentEventHandler.start().catch((err) => {
    console.error(
      "[index] Failed to start payment event handler:",
      err?.message ?? err,
    );
  });

  autoCaptureService.startAutoCaptureJob();
}

export default app;
