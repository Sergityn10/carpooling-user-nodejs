/**
 * Data Transfer Objects (DTOs) para Monedero y Operaciones Financieras.
 * Cumplimiento PSD2 y mitigación de HIGH-03, HIGH-04, HIGH-05.
 */

export class WalletDTO {
  /**
   * Sanitización de balance de monedero.
   */
  static toBalance({ walletAccount, stripeAccount, isLivemode = false }) {
    return {
      status: "Success",
      balance: walletAccount ? Number(walletAccount.balance) : 0,
      currency: walletAccount?.currency || "eur",
      wallet_status: walletAccount?.status || "inactive",
      charges_enabled: Boolean(stripeAccount?.charges_enabled),
      transfers_enabled: Boolean(stripeAccount?.transfers_enabled),
      details_submitted: Boolean(stripeAccount?.details_submitted),
      livemode: Boolean(isLivemode),
    };
  }

  /**
   * Sanitización de listado de transacciones.
   */
  static toTransactions(transactions) {
    if (!Array.isArray(transactions)) return [];
    return transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount || 0),
      currency: t.currency || "eur",
      type: t.type,
      status: t.status,
      created_at: t.created_at,
      description: t.description ?? null,
    }));
  }
}
