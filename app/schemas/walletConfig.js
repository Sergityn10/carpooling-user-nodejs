import z from "zod";

const walletConfigUpdateSchema = z.object({
  wallet_enabled: z.boolean().optional(),
  recharges_enabled: z.boolean().optional(),
  payouts_enabled: z.boolean().optional(),
  payments_enabled: z.boolean().optional(),
  min_recharge_cents: z.number().int().min(0).optional(),
  max_recharge_cents: z.number().int().min(0).optional(),
  max_daily_payout_cents: z.number().int().min(0).optional(),
}).refine(
  (data) => {
    if (
      data.min_recharge_cents !== undefined &&
      data.max_recharge_cents !== undefined &&
      data.min_recharge_cents > data.max_recharge_cents
    ) {
      return false;
    }
    return true;
  },
  { message: "min_recharge_cents cannot be greater than max_recharge_cents" },
);

function validateWalletConfigUpdate(data) {
  return walletConfigUpdateSchema.safeParse(data);
}

export const WalletConfigSchemas = {
  validateWalletConfigUpdate,
};
