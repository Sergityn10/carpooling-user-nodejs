import { z } from "zod";

// Ejemplo de formato JSON válido para este esquema:
/*
{
    "user_id": 123,
    "id": 456,
    "telegram_username": "usuarioTelegram",
    "first_name": "Sergio",
    "last_name": "Perez",
    "chat_id": 789
}
*/
// Puedes omitir "username", "last_name" y "chat_id" porque son opcionales.

const telegramInfoSchema = z.object({
        username: z.string().min(3).max(50),
        id: z.number(),
        telegram_username: z.string().optional(),
        first_name: z.string(),
        last_name: z.string().optional(),
        chat_id: z.number().int().optional() // Permite números negativos y positivos enteros
});

const telegramInfoSinUserSchema = telegramInfoSchema.omit({username: true})
const telegramInfoPartial = telegramInfoSchema.partial()
function validateTelegramInfoSchema(info){
    return telegramInfoSchema.safeParse(info)
}

function validateTelegramInfoSinUser(info){
    return telegramInfoSinUserSchema.safeParse(info)
}

function validateTelegramInfoPartial(info){
    return telegramInfoPartial.safeParse(info)
}

export const TelegramInfo = {
    validateTelegramInfoSchema,
    validateTelegramInfoSinUser,
    validateTelegramInfoPartial,
    telegramInfoSchema,
    telegramInfoSinUserSchema
}