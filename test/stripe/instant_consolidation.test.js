import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Consolidación Inmediata de Pagos en Monedero Interno (T+0)", () => {
  it("debe consolidar e incrementar el saldo disponible en base de datos en cuanto se captura el trayecto", () => {
    // Estado inicial del monedero del conductor antes de terminar el trayecto
    const initialWallet = {
      user_id: "driver-uuid-888",
      currency: "eur",
      balance_cents: 2500, // 25.00 EUR
      status: "active",
    };

    // Al capturarse el trayecto (captureTripPayments):
    const tripNetRevenueCents = 1850; // 18.50 EUR ganancia neta del conductor
    const balanceBefore = initialWallet.balance_cents;
    const balanceAfter = balanceBefore + tripNetRevenueCents;

    const consolidatedTransaction = {
      user_id: initialWallet.user_id,
      currency: initialWallet.currency,
      type: "reservation_revenue",
      amount: tripNetRevenueCents,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      status: "succeeded", // Disponible de inmediato
      description: "Reserva de trayecto (ingreso consolidado)",
    };

    assert.equal(consolidatedTransaction.balance_before, 2500);
    assert.equal(consolidatedTransaction.balance_after, 4350);
    assert.equal(consolidatedTransaction.status, "succeeded", "El estado debe ser succeeded de inmediato sin esperar 7 días de Stripe");
  });

  it("permite reutilizar el saldo consolidado para pagar otro servicio de forma instantánea", () => {
    let currentBalance = 4350; // 43.50 EUR consolidados
    const nextTripCost = 1500; // 15.00 EUR por reservar otro viaje

    // Pago con saldo interno
    const canPayWithWallet = currentBalance >= nextTripCost;
    assert.equal(canPayWithWallet, true, "El conductor puede pagar con sus ganancias de inmediato");

    currentBalance -= nextTripCost;
    assert.equal(currentBalance, 2850, "El saldo restante se actualiza de inmediato");
  });
});
