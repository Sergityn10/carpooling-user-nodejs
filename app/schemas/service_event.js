import { z } from "zod";

const ServiceEventSchema = z.object({
    id: z.number().int().positive().optional(),
    enterprise_id: z.number().int().positive(),
    title: z.string().min(3).max(255),
    description: z.string().max(5000).optional(),
    start_at: z.string().min(1),
    end_at: z.string().min(1).optional(),
    status: z.enum(["draft", "requested", "approved", "rejected", "canceled", "completed"]).default("requested"),
    venue_name: z.string().max(255).optional(),
    address_line1: z.string().min(3).max(255),
    address_line2: z.string().max(255).optional(),
    city: z.string().min(2).max(120),
    province: z.string().max(120).optional(),
    postal_code: z.string().max(20).optional(),
    country: z.string().min(2).max(2).default("ES"),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    contact_name: z.string().max(255).optional(),
    contact_email: z.string().email().optional(),
    contact_phone: z.string().max(30).optional(),
    attendees_estimate: z.number().int().nonnegative().optional(),
    notes: z.string().max(5000).optional(),
});

const ServiceEventSchemaCreate = z.object({
    name: z.string(),
    location: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string()
    })

const ServiceEventSchemaPartial = ServiceEventSchema.partial();
const ServiceEventSchemaWithoutId = ServiceEventSchema.omit({ id: true });
// const ServiceEventSchemaCreate = ServiceEventSchema.omit({ id: true, enterprise_id: true,latitude:true, longitude:true });

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
