import { z } from "zod";

const UnifiedLoginSchema = z
  .object({
    email: z
      .string()
      .email("El formato del correo electrónico no es válido")
      .toLowerCase()
      .optional(),
    password: z
      .string()
      .min(1, "La contraseña es requerida")
      .optional(),
    id_token: z.string().optional(),
    google_token: z.string().optional(),
    auth_method: z.enum(["password", "google", "auto"]).default("auto"),
    auth_type: z.enum(["enterprise", "user", "auto"]).default("auto"),
    consents: z
      .object({
        privacy_policy_accepted: z.boolean().optional(),
        terms_of_service_accepted: z.boolean().optional(),
        marketing_accepted: z.boolean().optional(),
        privacy_version: z.string().optional(),
        terms_version: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      const hasPasswordAuth = Boolean(data.email && data.password);
      const hasGoogleAuth = Boolean(data.id_token || data.google_token);
      return hasPasswordAuth || hasGoogleAuth;
    },
    {
      message:
        "Debes proporcionar email y contraseña o un token válido de Google (id_token).",
    },
  );

export const UnifiedAuthSchemas = {
  validateUnifiedLogin: (data) => UnifiedLoginSchema.safeParse(data),
};
