import { z } from "zod";

const coordinateField = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const num = Number(v);
    return Number.isNaN(num) ? null : num;
  });

const attendeesField = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const num = parseInt(v, 10);
    return Number.isNaN(num) || num < 0 ? null : num;
  });

const ServiceEventSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  enterprise_id: z.union([z.string(), z.number()]).optional(),
  title: z.string().min(3).max(255),
  description: z.string().max(5000).nullable().optional(),
  start_at: z.string().min(1),
  end_at: z.string().min(1).nullable().optional(),
  status: z
    .enum([
      "draft",
      "requested",
      "approved",
      "rejected",
      "canceled",
      "completed",
    ])
    .default("requested"),
  venue_name: z.string().max(255).nullable().optional(),
  address_line1: z.string().min(3).max(255),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().min(2).max(120),
  province: z.string().max(120).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  country: z.string().min(2).max(2).default("ES"),
  latitude: coordinateField,
  longitude: coordinateField,
  contact_name: z.string().max(255).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().max(30).nullable().optional(),
  attendees_estimate: attendeesField,
  notes: z.string().max(5000).nullable().optional(),
  image: z.string().nullable().optional(),
});

const ServiceEventSchemaCreate = z
  .object({
    name: z.string().optional(),
    title: z.string().optional(),
    location: z.string().optional(),
    address: z.string().optional(),
    address_line1: z.string().optional(),
    startDate: z.string().optional(),
    start_date: z.string().optional(),
    start_at: z.string().optional(),
    endDate: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    description: z.string().max(5000).nullable().optional().default(""),
    image: z.string().nullable().optional(),
    latitude: coordinateField,
    longitude: coordinateField,
    venue_name: z.string().max(255).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    attendees_estimate: attendeesField,
    max_attendees: attendeesField,
    asistentes: attendeesField,
  })
  .transform((data) => {
    const result = { ...data };
    result.name = (result.name || result.title || "").trim();
    result.location = (
      result.location ||
      result.address ||
      result.address_line1 ||
      ""
    ).trim();
    result.startDate =
      result.startDate || result.start_date || result.start_at || "";
    result.endDate =
      result.endDate || result.end_date || result.end_at || null;
    const estimate =
      result.attendees_estimate ??
      result.max_attendees ??
      result.asistentes ??
      null;
    result.attendees_estimate = estimate;
    delete result.max_attendees;
    delete result.asistentes;
    delete result.title;
    delete result.address;
    delete result.address_line1;
    delete result.start_date;
    delete result.start_at;
    delete result.end_date;
    delete result.end_at;
    return result;
  })
  .pipe(
    z.object({
      name: z.string().min(1, "El nombre del evento es obligatorio"),
      location: z.string().min(1, "La ubicación o dirección es obligatoria"),
      startDate: z.string().min(1, "La fecha de inicio es obligatoria"),
      endDate: z.string().nullable().optional(),
      description: z.string().max(5000).nullable().optional().default(""),
      image: z.string().nullable().optional(),
      latitude: coordinateField,
      longitude: coordinateField,
      venue_name: z.string().max(255).nullable().optional(),
      city: z.string().max(120).nullable().optional(),
      attendees_estimate: attendeesField,
    })
  );

const ServiceEventSchemaPartial = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    enterprise_id: z.union([z.string(), z.number()]).optional(),
    title: z.string().min(1).max(255).optional(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    start_at: z.string().optional(),
    startDate: z.string().optional(),
    end_at: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    status: z
      .enum([
        "draft",
        "requested",
        "approved",
        "rejected",
        "canceled",
        "completed",
      ])
      .optional(),
    venue_name: z.string().max(255).nullable().optional(),
    address_line1: z.string().max(255).optional(),
    location: z.string().max(255).optional(),
    address_line2: z.string().max(255).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    province: z.string().max(120).nullable().optional(),
    postal_code: z.string().max(20).nullable().optional(),
    country: z.string().min(2).max(2).optional(),
    latitude: coordinateField,
    longitude: coordinateField,
    contact_name: z.string().max(255).nullable().optional(),
    contact_email: z.string().email().nullable().optional(),
    contact_phone: z.string().max(30).nullable().optional(),
    attendees_estimate: attendeesField,
    max_attendees: attendeesField,
    asistentes: attendeesField,
    notes: z.string().max(5000).nullable().optional(),
    image: z.string().nullable().optional(),
  })
  .transform((data) => {
    const result = { ...data };
    if (result.name && !result.title) result.title = result.name;
    if (result.location && !result.address_line1)
      result.address_line1 = result.location;
    if (result.startDate && !result.start_at)
      result.start_at = result.startDate;
    if (result.endDate !== undefined && result.end_at === undefined)
      result.end_at = result.endDate;

    const estimate =
      result.attendees_estimate ??
      result.max_attendees ??
      result.asistentes;
    if (estimate !== undefined) {
      result.attendees_estimate = estimate;
    }

    delete result.name;
    delete result.location;
    delete result.startDate;
    delete result.endDate;
    delete result.max_attendees;
    delete result.asistentes;
    return result;
  });

const ServiceEventSchemaWithoutId = ServiceEventSchema.omit({ id: true });

function validateServiceEvent(data) {
  return ServiceEventSchema.safeParse(data);
}

function validateServiceEventPartial(data) {
  return ServiceEventSchemaPartial.safeParse(data);
}

function validateServiceEventWithoutId(data) {
  return ServiceEventSchemaWithoutId.safeParse(data);
}

function validateServiceEventCreate(data) {
  return ServiceEventSchemaCreate.safeParse(data);
}

export const ServiceEventSchemas = {
  validateServiceEvent,
  validateServiceEventPartial,
  validateServiceEventWithoutId,
  validateServiceEventCreate,
};
