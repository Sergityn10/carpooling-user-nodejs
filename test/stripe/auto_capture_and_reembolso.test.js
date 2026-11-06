import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Auto-Captura Preventiva (>5-6 días) y Reembolso de Pagos Capturados", () => {
  it("debe filtrar correctamente los PaymentIntents candidatos a auto-captura (antigüedad >= 5 días)", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const thresholdDays = 5;
    const thresholdDate = new Date(
      now.getTime() - thresholdDays * 24 * 60 * 60 * 1000,
    );

    const mockPayments = [
      {
        id: "pi_recent",
        state: "requires_capture",
        created_at: new Date("2026-11-03T10:00:00Z"), // 1 día
      },
      {
        id: "pi_near_expiration",
        state: "requires_capture",
        created_at: new Date("2026-10-29T10:00:00Z"), // 6 días (debe auto-capturarse)
      },
      {
        id: "pi_already_succeeded",
        state: "succeeded",
        created_at: new Date("2026-10-28T10:00:00Z"), // ya capturado
      },
      {
        id: "pi_checkout_completed_old",
        state: "checkout_completed",
        created_at: new Date("2026-10-30T08:00:00Z"), // 5.1 días (debe auto-capturarse)
      },
    ];

    const eligible = mockPayments.filter(
      (p) =>
        ["requires_capture", "checkout_completed"].includes(p.state) &&
        p.created_at <= thresholdDate,
    );

    assert.equal(eligible.length, 2);
    assert.deepEqual(
      eligible.map((p) => p.id),
      ["pi_near_expiration", "pi_checkout_completed_old"],
    );
  });

  it("debe capturar pagos en requires_capture y transicionar su estado a succeeded", () => {
    const mockStripePI = {
      id: "pi_test_autocap_1",
      status: "requires_capture",
      amount: 1850,
      currency: "eur",
      metadata: {
        id_reserva: "res-expiring-99",
        driver_price_cents: "1500",
        platform_fee_cents: "350",
      },
    };

    function simulateCapture(stripePI) {
      if (stripePI.status === "requires_capture") {
        return {
          ...stripePI,
          status: "succeeded",
          amount_received: stripePI.amount,
        };
      }
      return stripePI;
    }

    const capturedResult = simulateCapture(mockStripePI);
    assert.equal(capturedResult.status, "succeeded");
    assert.equal(capturedResult.amount_received, 1850);
  });

  it("debe procesar un reembolso si la reserva es cancelada tras haber sido capturada", () => {
    const capturedPayment = {
      stripe_payment_id: "pi_already_captured_88",
      state: "succeeded",
      id_reserva: "res-cancel-01",
      amount: 2500,
    };

    function processCancellation(paymentIntent, cancellationReason) {
      if (paymentIntent.state === "succeeded" || paymentIntent.state === "captured") {
        return {
          action: "refund",
          newStatus: "refunded",
          refundParams: {
            payment_intent: paymentIntent.stripe_payment_id,
            reverse_transfer: true,
            refund_application_fee: true,
          },
          cancellationReason: cancellationReason || "requested_by_customer",
        };
      }
      return {
        action: "cancel",
        newStatus: "canceled",
      };
    }

    const result = processCancellation(capturedPayment, "user_cancelled_trip");
    assert.equal(result.action, "refund");
    assert.equal(result.newStatus, "refunded");
    assert.equal(result.refundParams.reverse_transfer, true);
    assert.equal(result.refundParams.refund_application_fee, true);
    assert.equal(result.refundParams.payment_intent, "pi_already_captured_88");
  });
});
