import z from "zod";

const userSchema = z.object({
    name: z.string(),
    phone: z.string().optional(),
    stripe_customer_id: z.string().optional(),
    username: z.string(
        {   required_error: "Username is required",
            invalid_type_error: "Username must be a string" }
    ).min(3).max(50),
    img_perfil: z.string().optional(),
    email: z.email(
        {   required_error: "Email is required",
            invalid_type_error: "Email must be a string" }
    ).min(3).max(50),
    password: z.string(),
    fecha_nacimiento: z.string(),
    ciudad: z.string(),
    provincia: z.string(),
    codigo_postal: z.string(),
    direccion: z.string(),
    about_me: z.string().min(3).max(255).optional(),
    dni: z.string().regex(/^[0-9]{8}[A-Za-z]$/),
    genero: z.enum(["Masculino", "Femenino", "Otro"]),
    stripe_account: z.string().optional(),
    stripe_customer_account: z.string().optional(),
    onboarding_ended: z.boolean().optional()

    
});

const loginSchema = z.object({
    email: z.email(
        {   required_error: "Email is required",
            invalid_type_error: "Email must be a string" }
    ),
    password: z.string(),
    
});

const registerSchema = z.object({
    name: z.string(),
    username: z.string(
        {   required_error: "Username is required",
            invalid_type_error: "Username must be a string" }
    ).min(3).max(50),
    email: z.email(
        {   required_error: "Email is required",
            invalid_type_error: "Email must be a string" }
    ),
    password: z.string()
    

})

const userSchemaPartial = userSchema.partial()

function validateLogin(data) {
    return loginSchema.safeParse(data);
}

function validateUserSchemaPartial(data){
    return userSchemaPartial.safeParse(data)
}

function validateRegisterSchema(data){
    return registerSchema.safeParse(data)
}

function validateUser(data) {
    return userSchema.safeParse(data);
}
const userUniversitySchema = z.object({
    username: z.string(
        {   required_error: "Username is required",
            invalid_type_error: "Username must be a string" }
    ).min(3).max(100),
    email: z.email().endsWith("@alumnos.unex.es"),
    password: z.string().min(6).max(100)
});

export const UserSchemas = {
    validateUser,
    validateLogin,
    validateUserSchemaPartial,
    validateRegisterSchema
};