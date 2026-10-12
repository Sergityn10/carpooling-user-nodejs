import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  EXPIRATION_TIME: z.string().default("1h"),
  JWT_COOKIES_EXPIRATION_TIME: z.coerce.number().default(15),
  JWT_ALGORITHM: z.literal("RS256").default("RS256"),
  ORIGIN: z.string().optional(),
  MY_ORIGIN: z.string().optional(),
  TRAYECTOS_ORIGIN: z.string().optional(),
  MESSAGES_ORIGIN: z.string().optional(),
  NOTIFICATIONS_ORIGIN: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(16, "ENCRYPTION_KEY debe tener al menos 16 caracteres").optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ [SECURITY ALERT] Error en validación de variables de entorno al arranque:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Configuración de entorno inválida. Deteniendo el servicio por seguridad.");
  }

  // Comprobación de seguridad PSD2 / DAST: Evitar livemode en entornos que no sean producción
  if (parsed.data.NODE_ENV !== "production" && parsed.data.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    console.warn("⚠️ [SECURITY WARNING] ¡ALERTA PSD2! Se ha detectado una clave de Stripe en modo producción (sk_live) en un entorno no productivo.");
  }

  return parsed.data;
}

export const env = validateEnv();
