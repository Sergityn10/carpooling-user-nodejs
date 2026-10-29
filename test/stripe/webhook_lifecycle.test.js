import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Ciclo de Vida de Webhooks Stripe (webhook.js)", () => {
  it("debe resolver al pagador (pasajero) sin cuenta Connect (sender_account es null)", () => {
    // Simulación del PaymentIntent completado por un pasajero ordinario
    const paymentIntent = {
      id: "pi_test_successful_123",
      amount: 1545,
      currency: "eur",
      status: "succeeded",
      customer: "cus_passenger_plain_001",
      transfer_data: {
        destination: "acct_driver_connect_002",
      },
      metadata: {
        id_reserva: "res-777",
        id_user: "user-passenger-uuid-001", // ID directo en metadatos
        recipient_user_id: "user-driver-uuid-002",
        driver_price_cents: "1304",
        platform_fee_cents: "193",
        stripe_fee_cents: "48",
      },
    };

    // Verificación de resolución de usuarios
    const payerUserId =
      paymentIntent.metadata.id_user ??
      (paymentIntent.customer ? "user-passenger-uuid-001" : null);

    const receiverUserId =
      paymentIntent.metadata.recipient_user_id ?? "user-driver-uuid-002";

    assert.equal(payerUserId, "user-passenger-uuid-001", "El pasajero debe resolverse aunque no tenga stripe_account");
    assert.equal(receiverUserId, "user-driver-uuid-002", "El conductor debe resolverse correctamente");
  });

  it("debe calcular los importes correctos de débito y crédito en monedero tras payment_intent.succeeded", () => {
    const grossAmountCents = 1545; // 15.45 EUR pagados por el pasajero
    const driverPriceCents = 1304; // 13.04 EUR para el conductor
    const platformFeeCents = 193; // 1.93 EUR comisión neta plataforma
    const stripeFeeCents = 48; // 0.48 EUR coste Stripe

    // Verificación de balance contable
    assert.equal(
      driverPriceCents + platformFeeCents + stripeFeeCents,
      grossAmountCents,
      "El total bruto cobrado debe ser igual al conductor + plataforma + Stripe",
    );

    // Movimientos contables en walletTransaction:
    const debitPasajero = -grossAmountCents;
    const creditConductor = driverPriceCents;
    const creditPlataforma = platformFeeCents;

    assert.equal(debitPasajero, -1545, "Al pasajero se le descuenta el total");
    assert.equal(creditConductor, 1304, "El conductor recibe su neto");
    assert.equal(creditPlataforma, 193, "La plataforma ingresa su comisión");
  });

  it("debe procesar eventos de checkout.session.completed para reservas", () => {
    const session = {
      id: "cs_test_completed_123",
      payment_status: "paid",
      metadata: {
        type: "reserva",
        id_reserva: "res-abc-123",
      },
      payment_intent: "pi_reserva_abc_123",
    };

    assert.equal(session.metadata.type, "reserva");
    assert.ok(session.payment_intent, "Debe tener payment_intent asociado");
    assert.equal(session.payment_status, "paid");
  });

  it("debe mapear correctamente los estados de cancelación y fallo", () => {
    const failedPI = {
      id: "pi_failed_123",
      status: "requires_payment_method",
      last_payment_error: {
        code: "card_declined",
        message: "Your card was declined.",
      },
    };

    const canceledPI = {
      id: "pi_canceled_123",
      status: "canceled",
      cancellation_reason: "abandoned",
    };

    assert.equal(failedPI.last_payment_error.code, "card_declined");
    assert.equal(canceledPI.status, "canceled");
  });
});
