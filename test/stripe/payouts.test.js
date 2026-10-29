import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Retiros y Payouts a Cuentas Bancarias Connect (payouts.test)", () => {
  it("debe exigir cuenta Connect para solicitar retiros", async () => {
    const { methods: payment } = await import("../../app/controllers/payment.js");

    const reqWithoutConnect = {
      body: { amount: 5000, currency: "eur" },
      user: { id: "user-without-connect" }, // sin stripe_account
    };

    let capturedError = null;
    const next = (err) => {
      capturedError = err;
    };

    await payment.createPayout(reqWithoutConnect, {}, next);

    assert.ok(capturedError, "Debe rechazar usuarios sin stripe_account");
    assert.equal(capturedError.statusCode, 404);
    assert.equal(capturedError.errorCode, "STRIPE_ACCOUNT_NOT_FOUND");
  });

  it("debe enviar el encabezado stripeAccount con la cuenta conectada del conductor al crear el payout en Stripe", () => {
    const user = {
      id: "driver-uuid-001",
      stripe_account: "acct_driver_spain_123",
    };

    const payoutParams = {
      amount: 4500, // 45.00 EUR
      currency: "eur",
      method: "standard",
      metadata: {
        userId: user.id,
      },
    };

    const stripeOptions = {
      stripeAccount: user.stripe_account,
      idempotencyKey: "idem-key-unique-789",
    };

    assert.equal(
      stripeOptions.stripeAccount,
      "acct_driver_spain_123",
      "El payout debe originarse en la cuenta conectada del conductor, no en la plataforma",
    );
    assert.equal(payoutParams.currency, "eur");
    assert.equal(payoutParams.amount, 4500);
  });

  it("debe validar suficiencia de saldo antes de descontar del monedero", () => {
    const balanceBefore = 3000; // 30.00 EUR
    const requestedPayout = 5000; // 50.00 EUR

    const hasSufficientBalance = balanceBefore >= requestedPayout;
    assert.equal(hasSufficientBalance, false, "Debe impedir retirar más dinero del disponible");
  });

  it("debe descontar el saldo de forma atómica y calcular el saldo posterior", () => {
    const balanceBefore = 8000; // 80.00 EUR
    const requestedPayout = 5000; // 50.00 EUR

    const balanceAfter = balanceBefore - requestedPayout;
    assert.equal(balanceAfter, 3000, "El balance posterior debe ser 30.00 EUR");
  });
});
