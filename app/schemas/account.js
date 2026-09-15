import { z } from "zod";

const accountSchema = z.object({
  stripe_account_id: z.string().min(1),
  user_id: z.string().min(1),
  charges_enabled: z.boolean().default(false),
  transfers_enabled: z.boolean().default(false),
  details_submitted: z.boolean().default(false),
  default_account: z.boolean().default(false),
});

const accountUpdateSchema = z.object({
  charges_enabled: z.boolean().optional(),
  transfers_enabled: z.boolean().optional(),
  details_submitted: z.boolean().optional(),
  default_account: z.boolean().optional(),
});

function validateAccount(data) {
  return accountSchema.safeParse(data);
}

function validateAccountUpdate(data) {
  return accountUpdateSchema.safeParse(data);
}

export const AccountSchemas = {
  validateAccount,
  validateAccountUpdate,
};
