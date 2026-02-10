import { z } from "zod";
let year = new Date().getFullYear();
const cocheSchema = z.object({
  id_coche: z.number().int().positive(),
  matricula: z.string().min(7).max(7),
  marca: z.string().min(3).max(50),
  modelo: z.string().min(3).max(50),
  year: z.number().int().min(1950).max(year),
  color: z.string().min(3).max(50).optional(),
  tipo_combustible: z.enum(["Gasolina", "Diesel", "Electrico", "Hibrido"]),
  num_plazas: z.number().int().min(1).max(7),
  user_id: z.number().int().positive(),
});

const cocheSchemaPartial = cocheSchema.partial();
const cocheSchemaSinId = cocheSchema.omit({ id_coche: true, user_id: true });
function validateCoche(data) {
  return cocheSchema.safeParse(data);
}
function validateCocheSinId(data) {
  return cocheSchemaSinId.safeParse(data);
}

function validateCochePartial(data) {
  return cocheSchemaPartial.safeParse(data);
}

export const CocheSchemas = {
  validateCoche,
  validateCochePartial,
  validateCocheSinId,
};
