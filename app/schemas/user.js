import z from "zod";

const userSchema = z.object({
  name: z.string().optional(),
  surname: z.string().optional(),
  phone: z.string().optional(),
  stripe_customer_id: z.string().optional(),
  img_perfil: z.string().optional(),
  email: z
    .email({
      required_error: "Email is required",
      invalid_type_error: "Email must be a string",
    })
    .min(3)
    .max(50),
  password: z.string().optional(),
  fecha_nacimiento: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "fecha_nacimiento must be a valid date string (YYYY-MM-DD)",
    }),
  ciudad: z.string().optional(),
  provincia: z.string().optional(),
  codigo_postal: z.string().optional(),
  direccion: z.string().optional(),
  about_me: z.string().min(3).max(255).optional(),
  dni: z
    .string()
    .regex(/^[0-9]{8}[A-Za-z]$/)
    .optional(),
  genero: z.enum(["Masculino", "Femenino", "Otro"]).optional(),
  stripe_account: z.string().optional(),
  stripe_customer_account: z.string().optional(),
  onboarding_ended: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.email({
    required_error: "Email is required",
    invalid_type_error: "Email must be a string",
  }),
  password: z.string(),
});

const registerSchema = z.object({
  email: z.email({
    required_error: "Email is required",
    invalid_type_error: "Email must be a string",
  }),
  password: z.string(),
  consents: z
    .object({
      privacy_policy_accepted: z.boolean(),
      terms_of_service_accepted: z.boolean(),
      marketing_accepted: z.boolean().optional().default(false),
      privacy_version: z.string().default("v1.0"),
      terms_version: z.string().default("v1.0"),
    })
    .optional(),
});

const userSchemaPartial = userSchema.partial();

function validateLogin(data) {
  return loginSchema.safeParse(data);
}

function validateUserSchemaPartial(data) {
  return userSchemaPartial.safeParse(data);
}

function validateRegisterSchema(data) {
  return registerSchema.safeParse(data);
}

function validateUser(data) {
  return userSchema.safeParse(data);
}

export const UserSchemas = {
  validateUser,
  validateLogin,
  validateUserSchemaPartial,
  validateRegisterSchema,
};
