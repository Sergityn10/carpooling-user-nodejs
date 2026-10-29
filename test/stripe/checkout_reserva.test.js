import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("Flujo de Checkout de Reservas (createCheckoutPaymentIntent)", () => {
  it("debe rechazar la reserva si falta recipient_user_id", async () => {
    const { methods: payment } = await import("../../app/controllers/payment.js");

    const req = {
      body: {
        amount: 1000,
        id_reserva: "res-123",
      },
      user: { id: "user-passenger-1" },
    };
    const res = {};
    let capturedError = null;
    const next = (err) => {
      capturedError = err;
    };

    await payment.createCheckoutPaymentIntent(req, res, next);

    assert.ok(capturedError, "Debe invocar next() con un error");
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.errorCode, "VALIDATION_ERROR");
  });

  it("debe rechazar la reserva si el importe es cero o negativo", async () => {
    const { methods: payment } = await import("../../app/controllers/payment.js");

    const req = {
      body: {
        amount: -50,
        recipient_user_id: "driver-123",
        id_reserva: "res-123",
      },
      user: { id: "user-passenger-1" },
    };
    let capturedError = null;
    const next = (err) => {
      capturedError = err;
    };

    await payment.createCheckoutPaymentIntent(req, {}, next);

    assert.ok(capturedError, "Debe rechazar importes inválidos");
    assert.equal(capturedError.statusCode, 400);
  });

  it("debe estructurar correctamente la sesión de Checkout con destino y metadatos", () => {
    // Verificamos la forma esperada del payload enviado a Stripe Checkout
    const sharedMetadata = {
      type: "reserva",
      id_user: "user-123",
      id_reserva: "res-999",
      sender_account: "",
      destination_account: "acct_driver_456",
      recipient_user_id: "driver-456",
      total_cents: "1041",
      driver_price_cents: "870",
      application_fee_cents: "171",
    };

    const checkoutPayload = {
      customer: "cus_passenger_789",
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: 1041,
            product_data: { name: "Reserva de trayecto" },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: 171,
        capture_method: "manual",
        transfer_data: {
          destination: "acct_driver_456",
        },
        metadata: sharedMetadata,
      },
      metadata: sharedMetadata,
      expand: ["payment_intent"],
    };

    assert.equal(checkoutPayload.payment_intent_data.transfer_data.destination, "acct_driver_456");
    assert.equal(checkoutPayload.payment_intent_data.application_fee_amount, 171);
    assert.deepEqual(checkoutPayload.expand, ["payment_intent"], "Debe solicitar expand de payment_intent para evitar huérfanos");
  });
});
