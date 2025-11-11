import { z } from "zod";

const customerSchema = z.object({
    stripe_customer_id: z.string(),
    user_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
});
