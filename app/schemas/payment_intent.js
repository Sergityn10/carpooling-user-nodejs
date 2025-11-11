import { z } from "zod";

const paymentIntentSchema = z.object({
    amount: z.number(),
    description: z.string(),
    destination_account: z.string(),
    state: z.enum(["pending", "succeeded","canceled","pending-confirmation", "failed"]),
    sender_account: z.string(),
    payment_id: z.string(),
    

});

const paymentIntentSchemaPartial = paymentIntentSchema.partial();

const validatePaymentIntentSchema = (data) => {
    return paymentIntentSchema.safeParse(data);
};

const validatePaymentIntentSchemaPartial = (data) => {
    return paymentIntentSchemaPartial.safeParse(data);
};

export const PaymentIntentSchemas = {
    validatePaymentIntentSchema,
    validatePaymentIntentSchemaPartial,
};
