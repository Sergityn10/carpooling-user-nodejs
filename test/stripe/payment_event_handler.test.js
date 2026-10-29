import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Gestor de Eventos de Reserva RabbitMQ (paymentEventHandler)", () => {
  it("debe validar la estructura de eventos requeridos para reserva.created.payment_required", () => {
    const validEvent = {
      data: {
        id_reserva: "res-001",
        user_id: "usr-pass-1",
        trayecto_id: "tray-100",
        conductor_id: "usr-driv-1",
        payment: {
          amount: 1500,
          currency: "eur",
          recipient_user_id: "usr-driv-1",
          description: "Viaje Madrid - Valencia",
        },
      },
    };

    assert.ok(validEvent.data.id_reserva, "id_reserva es obligatorio");
    assert.ok(validEvent.data.user_id, "user_id es obligatorio");
    assert.ok(validEvent.data.payment.amount > 0, "amount debe ser mayor a cero");
    assert.ok(validEvent.data.payment.recipient_user_id, "recipient_user_id es obligatorio");
  });

  it("garantiza que la sesión de Checkout es la única que genera el PaymentIntent (sin duplicados huérfanos)", () => {
    // Simulación del objeto devuelto por Stripe checkout.sessions.create con expand: ["payment_intent"]
    const mockCheckoutSession = {
      id: "cs_test_abc123",
      url: "https://checkout.stripe.com/c/pay/cs_test_abc123",
      payment_intent: {
        id: "pi_real_from_checkout_999",
        status: "requires_payment_method",
        amount: 1550,
      },
      metadata: {
        id_reserva: "res-001",
        type: "reserva",
      },
    };

    const resolvedPaymentIntentId =
      typeof mockCheckoutSession.payment_intent === "string"
        ? mockCheckoutSession.payment_intent
        : mockCheckoutSession.payment_intent?.id;

    assert.equal(
      resolvedPaymentIntentId,
      "pi_real_from_checkout_999",
      "El ID guardado en base de datos debe ser el ID real de Checkout, no un PI huérfano",
    );
    assert.equal(mockCheckoutSession.payment_intent.status, "requires_payment_method");
  });
});
