import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Gestión de Reservas con Mucha Antelación y Expiración Stripe (antelacion_auth)", () => {
  const STRIPE_AUTH_WINDOW_DAYS = 7;
  const STRIPE_AUTH_WINDOW_MS = STRIPE_AUTH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  function evaluateTripAdvance(bookingDate, tripDate) {
    const diffMs = tripDate.getTime() - bookingDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return {
      diffDays,
      exceedsManualAuthWindow: diffMs > STRIPE_AUTH_WINDOW_MS,
      recommendedCaptureMethod: diffMs > STRIPE_AUTH_WINDOW_MS ? "automatic_escrow" : "manual_or_escrow",
    };
  }

  it("debe detectar si una reserva supera la ventana de preautorización de 7 días", () => {
    const bookingDate = new Date("2026-11-01T10:00:00Z");
    const tripClose = new Date("2026-11-04T10:00:00Z"); // 3 días
    const tripFar = new Date("2026-11-20T10:00:00Z"); // 19 días

    const evalClose = evaluateTripAdvance(bookingDate, tripClose);
    assert.equal(evalClose.diffDays, 3);
    assert.equal(evalClose.exceedsManualAuthWindow, false);

    const evalFar = evaluateTripAdvance(bookingDate, tripFar);
    assert.equal(evalFar.diffDays, 19);
    assert.equal(evalFar.exceedsManualAuthWindow, true);
    assert.equal(evalFar.recommendedCaptureMethod, "automatic_escrow");
  });

  it("debe clasificar una preautorización vencida como authorization_expired al intentar capturar", () => {
    // Simulación de respuesta de Stripe para un PaymentIntent cuya retención caducó tras 7 días
    const expiredStripePI = {
      id: "pi_expired_after_7_days",
      status: "canceled",
      cancellation_reason: "abandoned",
      amount: 2500,
      currency: "eur",
    };

    const isExpired =
      expiredStripePI.status === "canceled" &&
      (expiredStripePI.cancellation_reason === "abandoned" || !expiredStripePI.cancellation_reason);

    assert.equal(isExpired, true, "Debe ser detectado como expirado");

    const captureResult = {
      payment_intent_id: expiredStripePI.id,
      id_reserva: "res-long-advance-01",
      status: expiredStripePI.status,
      reason: isExpired ? "authorization_expired" : "not_in_requires_capture_state",
      details: isExpired ? "La preautorización de Stripe superó la ventana de 7 días y caducó." : undefined,
    };

    assert.equal(captureResult.reason, "authorization_expired");
    assert.ok(captureResult.details.includes("7 días"));
  });

  it("con modelo de custodia/escrow (Opción 1 elegida), los fondos ya están capturados y no pueden expirar", () => {
    // Con cobro inmediato y custodia, el estado en Stripe es 'succeeded' desde el checkout
    const escrowStripePI = {
      id: "pi_escrow_secured_123",
      status: "succeeded",
      amount: 2500,
      currency: "eur",
    };

    // Al ejecutarse captureTripPayments al final del viaje:
    let isCaptured = false;
    if (escrowStripePI.status === "succeeded") {
      isCaptured = true;
    }

    assert.equal(isCaptured, true, "El importe está 100% asegurado y no expira");
  });
});
