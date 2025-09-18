import z from "zod";

const userSchema = z.object({
    name: z.string().optional(),
    surname: z.string().optional(),
    phone: z.string().optional(),
    username: z.string(
        {   required_error: "Username is required",
            invalid_type_error: "Username must be a string" }
    ).min(3).max(50),
    email: z.email(),
    password: z.string().min(6).max(100),
    
});
const loginSchema = z.object({
    username: z.string(
        {   required_error: "Username is required",
            invalid_type_error: "Username must be a string" }
    ).min(3).max(50),
    password: z.string().min(6).max(100)
});

const userSchemaPartial = userSchema.partial()

function validateLogin(data) {
    return loginSchema.safeParse(data);
}

function validateUserSchemaPartial(data){
    return userSchemaPartial.safeParse(data)
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
    validateUserSchemaPartial
};