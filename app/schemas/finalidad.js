import { z } from "zod";

export const finalidadSchema = z.object({
    finalidad: z.string().min(1).max(100),
    finalidad_id: z.number().min(1),
    description: z.string().min(1).max(100),
});
const finalidadSchemaPartial = finalidadSchema.partial();
const finalidadSchemaSinId = finalidadSchema.omit({ finalidad_id: true });
const validateFinalidadSchema = (data) => {
    return finalidadSchema.safeParse(data);
};

const validateFinalidadSchemaSinId = (data) => {
    return finalidadSchemaSinId.safeParse(data);
};

const validateFinalidadSchemaPartial = (data) => {
    return finalidadSchemaPartial.safeParse(data);
};
export const finalidadSchemas = {
    validateFinalidadSchema,
    validateFinalidadSchemaSinId,
    validateFinalidadSchemaPartial,
};