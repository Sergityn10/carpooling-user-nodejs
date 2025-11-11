import { z } from "zod";

export const EventSchema = z.object({
    data: z.json(),
    source: z.string(),
    processing_error: z.string().optional(),
    status: z.string()
})

export const validateEvent = (event) => {
    return EventSchema.safeParse(event);
}
const EventNoSourceSchema = EventSchema.omit({source: true})

export const validateEventNoSource = (event) => {
    return EventNoSourceSchema.safeParse(event);
}



