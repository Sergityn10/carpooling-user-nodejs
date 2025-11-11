import {z} from "zod";
const horaRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const DisponibilidadSemanaSchema = z.object({
    disponibilidad_semana_id: z.number().min(1),
    username: z.string().min(3).max(100),
    dia_semana: z.enum(["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]),
    hora_inicio: z.string().min(5).max(5).regex(horaRegex),
    hora_fin: z.string().min(5).max(5).regex(horaRegex),
    transport_needed: z.boolean(),
    transporte: z.string().min(3).max(100).optional(),
    estado: z.enum(["Disponible", "Ocupado"]),
    finalidad: z.string().min(3).max(100),
    origen: z.string().min(3).max(200),
    destino: z.string().min(3).max(200),
    
})
const DisponibilidadSemanaOptional = DisponibilidadSemanaSchema.optional()
const DisponibilidadSemanaSinId = DisponibilidadSemanaSchema.omit({disponibilidad_semana_id: true})

async function validateDisponibilidadSemanaSinId(data) {
    return DisponibilidadSemanaSinId.safeParse(data);
}

async function validateDisponibilidadSemana(data) {
    return DisponibilidadSemanaOptional.safeParse(data);
}

function validateDisponibilidadSemanaPartial(data) {
    return DisponibilidadSemanaOptional.safeParse(data);
}

export const DisponibilidadSemanaSchemas = {
    validateDisponibilidadSemanaSinId,
    validateDisponibilidadSemana,
    validateDisponibilidadSemanaPartial,
}
