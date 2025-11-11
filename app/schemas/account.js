import { z } from "zod";

const accountSchema = z.object({
    stripe_account_id: z.string(),
    username: z.string(),
    charges_enabled: z.boolean().default(false),
    transfers_enabled: z.boolean().default(false),
    details_submitted: z.boolean().default(false),
    
});

const accountSchemaPartial = accountSchema.partial();

function validateAccount(data) {
    return accountSchema.safeParse(data);
}

function validateAccountPartial(data) {
    return accountSchemaPartial.safeParse(data);
}

export const AccountSchemas = {
    validateAccount,
    validateAccountPartial
};
