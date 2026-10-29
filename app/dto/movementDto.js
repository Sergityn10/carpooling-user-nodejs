/**
 * MovementDTO
 * Formateo y sanitización estricta de movimientos financieros y de reservas.
 * Cumplimiento PSD2, GDPR y prevención de fugas de datos sensibles (OWASP).
 */
export class MovementDTO {
  /**
   * Sanitiza un movimiento individual para un usuario concreto.
   *
   * @param {Object} item Registro de WalletTransaction con posibles relaciones
   * @param {string} currentUserId ID del usuario autenticado que realiza la consulta
   * @returns {Object} Movimiento formateado y seguro
   */
  static toMovement(item, currentUserId) {
    if (!item) return null;

    const isRevenue = item.type === "reservation_revenue";
    const isPayment = item.type === "reservation_payment";
    const isPayout = item.type === "credit" && (item.description?.toLowerCase().includes("payout") || item.walletPayouts?.length > 0);
    const isRecharge = item.type === "deposit";
    const isRefund = item.type === "refund" || item.type === "refund_reversal";

    // Determinamos el rol del usuario en este movimiento específico
    let role = "general";
    if (isRevenue) role = "driver";
    else if (isPayment) role = "passenger";
    else if (isPayout) role = "driver";
    else if (isRecharge) role = "passenger";

    // Contraparte saneada (si existe)
    let counterpart = null;
    const rawCounterpart = item.counterpartUser || item.counterpart;
    if (rawCounterpart) {
      counterpart = {
        id: String(rawCounterpart.id),
        name: rawCounterpart.name ?? "Usuario YouConnext",
        surname_initial: rawCounterpart.surname
          ? `${rawCounterpart.surname.charAt(0)}.`
          : null,
        img_perfil: rawCounterpart.img_perfil ?? null,
      };
    }

    // Método de pago saneado (nunca números completos ni CVV)
    let paymentMethod = null;
    const pi = item.paymentIntent;
    if (pi?.payment_method_last4 || pi?.last4) {
      paymentMethod = {
        brand: pi.payment_method_brand ?? pi.brand ?? "card",
        last4: String(pi.payment_method_last4 ?? pi.last4),
      };
    }

    const rawAmount = Number(item.amount ?? 0);
    const isNegative = rawAmount < 0;
    const absoluteCents = Math.abs(rawAmount);

    return {
      id: String(item.id),
      id_reserva: item.id_reserva ? String(item.id_reserva) : null,
      type: item.type,
      role,
      status: String(item.status ?? "succeeded"),
      currency: String(item.currency ?? "eur").toLowerCase(),
      description: item.description ?? null,
      amounts: {
        raw_cents: rawAmount,
        absolute_cents: absoluteCents,
        formatted_eur: (rawAmount / 100).toFixed(2),
        is_negative: isNegative,
        balance_before_cents: Number(item.balance_before ?? 0),
        balance_after_cents: Number(item.balance_after ?? 0),
      },
      payment_method: paymentMethod,
      counterpart,
      created_at: item.created_at
        ? new Date(item.created_at).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Sanitiza una lista de movimientos y devuelve el resumen de metadatos.
   */
  static toMovementList(items, currentUserId) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => MovementDTO.toMovement(item, currentUserId))
      .filter(Boolean);
  }
}
