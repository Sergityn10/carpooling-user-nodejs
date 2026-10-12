import { z } from "zod";

/**
 * Middleware genérico y reutilizable para validación declarativa con Zod.
 * @param {z.ZodSchema} schema - Esquema Zod a validar
 * @param {'body' | 'query' | 'params'} source - Origen de los datos (por defecto 'body')
 */
export function validateRequest(schema, source = "body") {
  return (req, res, next) => {
    const data = req[source];
    const result = schema.safeParse(data);

    if (!result.success) {
      return res.status(400).json({
        status: "Error",
        code: "VALIDATION_ERROR",
        message: "Los datos proporcionados no cumplen con el formato requerido.",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Sobrescribir con los datos tipados y saneados por Zod
    req[source] = result.data;
    return next();
  };
}

/**
 * Esquema común para validación de identificadores UUID en parámetros de URL.
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid("El identificador debe ser un UUID válido."),
});

/**
 * Esquema de validación para recarga de monedero (recharge).
 */
export const rechargeWalletSchema = z.object({
  amount: z.number().positive("El monto debe ser superior a 0 euros."),
  currency: z.literal("eur").default("eur"),
});

/**
 * Esquema de validación para retiro de fondos (payout).
 */
export const payoutWalletSchema = z.object({
  amount: z.number().positive("El monto a retirar debe ser mayor que 0."),
});
