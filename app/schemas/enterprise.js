import { z } from "zod";

/**
 * Expresión regular para política de contraseñas robustas:
 * - Mínimo 8 caracteres
 * - Al menos una letra minúscula
 * - Al menos una letra mayúscula
 * - Al menos un número
 * - Al menos un carácter especial (@$!%*?&_-#)
 */
export const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#])[A-Za-z\d@$!%*?&_\-#]{8,}$/;

const EnterpriseBaseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string({ required_error: "El nombre de la empresa es obligatorio" })
    .min(2, "El nombre de la empresa debe tener al menos 2 caracteres")
    .max(255, "El nombre no puede superar los 255 caracteres"),
  description: z
    .string({ required_error: "La descripción es obligatoria" })
    .min(10, "La descripción debe tener al menos 10 caracteres"),
  location: z
    .string({ required_error: "La ubicación de la empresa es obligatoria" })
    .min(3, "La ubicación debe tener al menos 3 caracteres")
    .max(255),
  email: z
    .string({ required_error: "El correo electrónico es obligatorio" })
    .email("El formato del correo electrónico no es válido")
    .max(255)
    .toLowerCase(),
  password: z
    .string({ required_error: "La contraseña es obligatoria" })
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no puede superar los 128 caracteres")
    .regex(
      strongPasswordRegex,
      "La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&_-#)"
    ),
  phone: z.string().max(30).optional().nullable(),
  cif: z.string().max(50).optional().nullable(),
  website: z.string().max(255).optional().nullable(),
  logo: z.string().optional().nullable(),
  contact_person: z.string().max(255).optional().nullable(),
  sector: z.string().max(100).optional().nullable(),
  employee_count: z.number().int().positive().optional().nullable(),
  address_line1: z.string().max(255).optional().nullable(),
  address_line2: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  province: z.string().max(120).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  country: z.string().min(2).max(2).default("ES"),
  verified: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// Alta creada por el administrador
const EnterpriseCreateSchema = EnterpriseBaseSchema;

// Login de la organización
const EnterpriseLoginSchema = z.object({
  email: z.string().email("Formato de correo inválido").toLowerCase(),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

// Actualización parcial (sin id, password, ni campos críticos de seguridad)
const EnterpriseUpdateSchema = EnterpriseBaseSchema.omit({
  id: true,
  password: true,
})
  .partial();

// Cambio de contraseña por la propia organización
const EnterpriseChangePasswordSchema = z
  .object({
    current_password: z
      .string({ required_error: "La contraseña actual es obligatoria" })
      .min(1, "Debes proporcionar tu contraseña actual"),
    new_password: z
      .string({ required_error: "La nueva contraseña es obligatoria" })
      .min(8, "La nueva contraseña debe tener al menos 8 caracteres")
      .max(128)
      .regex(
        strongPasswordRegex,
        "La nueva contraseña debe incluir al menos una mayúscula, una minúscula, un número y un símbolo especial (@$!%*?&_-#)"
      ),
    confirm_password: z
      .string({ required_error: "Debes confirmar la nueva contraseña" })
      .min(1, "Confirma tu nueva contraseña"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "La nueva contraseña y su confirmación no coinciden",
    path: ["confirm_password"],
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: "La nueva contraseña no puede ser idéntica a la contraseña actual",
    path: ["new_password"],
  });

// Reseteo administrativo de contraseña
const AdminResetPasswordSchema = z.object({
  new_password: z
    .string({ required_error: "La nueva contraseña es obligatoria" })
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128)
    .regex(
      strongPasswordRegex,
      "La contraseña debe incluir mayúscula, minúscula, número y símbolo especial"
    ),
});

// Filtros para listado en Web Admin
const EnterpriseQueryFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["all", "active", "inactive", "deleted", "verified"]).optional(),
  includeDeleted: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});

export const EnterpriseSchemas = {
  validateEnterpriseCreate: (data) => EnterpriseCreateSchema.safeParse(data),
  validateEnterpriseLogin: (data) => EnterpriseLoginSchema.safeParse(data),
  validateEnterpriseUpdate: (data) => EnterpriseUpdateSchema.safeParse(data),
  validateEnterpriseChangePassword: (data) =>
    EnterpriseChangePasswordSchema.safeParse(data),
  validateAdminResetPassword: (data) =>
    AdminResetPasswordSchema.safeParse(data),
  validateQueryFilters: (data) => EnterpriseQueryFilterSchema.safeParse(data),
  // Compatibilidad con código previo
  validateEnterpriseRegister: (data) => EnterpriseCreateSchema.safeParse(data),
  validateEnterprisePartialWithoutSensitive: (data) =>
    EnterpriseUpdateSchema.safeParse(data),
};
