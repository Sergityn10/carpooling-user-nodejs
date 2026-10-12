import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Limitador estricto para rutas de autenticación.
 * Mitiga ataques de fuerza bruta y credential stuffing (ALTO-13, ALTO-14, ALTO-15, MED-05).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Máximo 10 peticiones por ventana por IP
  standardHeaders: true, // Incluye cabeceras estándar RateLimit-*
  legacyHeaders: false, // Deshabilita cabeceras X-RateLimit-*
  message: {
    status: "Error",
    code: "TOO_MANY_REQUESTS",
    message: "Demasiados intentos de acceso desde esta IP. Por favor, inténtalo de nuevo en 15 minutos.",
  },
});

/**
 * Limitador para operaciones financieras (monedero, recargas, payouts).
 * Mitiga ALTO-16 y ALTO-17.
 * Soporta IPv6 agrupando subredes mediante ipKeyGenerator para evitar elusión por rotación de IPs.
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 15, // Máximo 15 operaciones por minuto
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `usr_${req.user.id}` : ipKeyGenerator(req.ip)),
  message: {
    status: "Error",
    code: "PAYMENT_RATE_LIMIT",
    message: "Límite de solicitudes de pago por minuto superado. Por favor, espera antes de continuar.",
  },
});

/**
 * Limitador general para el resto de la API.
 * Mitiga MED-10 a MED-25.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // Máximo 120 peticiones por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "Error",
    code: "RATE_LIMIT_EXCEEDED",
    message: "Has superado el límite de peticiones permitido. Por favor, reduce la frecuencia.",
  },
});

/**
 * Limitador para envío de notificaciones push.
 * Mitiga saturación y DoS en notifications (CRIT-03).
 */
export const pushLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // Máximo 20 solicitudes push por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "Error",
    code: "PUSH_RATE_LIMIT",
    message: "Límite de envío de notificaciones push alcanzado.",
  },
});
