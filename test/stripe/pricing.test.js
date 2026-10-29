import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateTotalPrice } from "../../app/controllers/payment.js";

describe("Cálculo de Precios y Comisiones Stripe (calculateTotalPrice)", () => {
  it("debe calcular correctamente el desglose para un trayecto estándar (10,00 EUR / 1000 céntimos)", () => {
    const netPriceCents = 1000; // 10 EUR
    const pricing = calculateTotalPrice(netPriceCents);

    // Margen plataforma: 15% -> driverPrice = round(1000 / 1.15) = 870 céntimos
    assert.equal(pricing.driver_price_cents, 870, "El conductor debe recibir 8.70 EUR");
    
    // Total con tarifa fija de Stripe (25 céntimos) y 1.5%: round((1000 + 25) / (1 - 0.015)) = round(1025 / 0.985) = 1041 céntimos
    assert.equal(pricing.total_cents, 1041, "El total cobrado al pasajero debe ser 10.41 EUR");

    // Comisión de Stripe: round(1041 * 0.015) + 25 = 16 + 25 = 41 céntimos
    assert.equal(pricing.stripe_fee_cents, 41, "La comisión de Stripe calculada debe ser 0.41 EUR");

    // Application fee (lo que se queda la plataforma en Stripe): total_cents - driver_price_cents = 1041 - 870 = 171 céntimos
    assert.equal(pricing.application_fee_cents, 171, "Application fee debe ser 1.71 EUR");

    // Margen neto de la plataforma (applicationFee - stripeFee): 171 - 41 = 130 céntimos (1.30 EUR = ~15% de 8.70 EUR)
    assert.equal(pricing.platform_fee_cents, 130, "El beneficio neto de la plataforma debe ser 1.30 EUR");

    // Conversión a euros
    assert.equal(pricing.total_eur, 10.41);
    assert.equal(pricing.driver_price_eur, 8.7);
    assert.equal(pricing.application_fee_eur, 1.71);
    assert.equal(pricing.platform_fee_eur, 1.3);
  });

  it("debe calcular correctamente importes pequeños (ej. 2,00 EUR)", () => {
    const netPriceCents = 200;
    const pricing = calculateTotalPrice(netPriceCents);

    assert.ok(pricing.total_cents > pricing.net_price_cents, "El total debe ser superior al neto");
    assert.ok(pricing.driver_price_cents < pricing.net_price_cents, "El conductor cobra el neto menos el margen");
    assert.ok(pricing.platform_fee_cents > 0, "El margen de la plataforma debe ser positivo");
    assert.equal(
      pricing.driver_price_cents + pricing.application_fee_cents,
      pricing.total_cents,
      "La suma del pago al conductor y la comisión debe igualar el total",
    );
  });

  it("debe garantizar consistencia aritmética en importes elevados (ej. 150,00 EUR)", () => {
    const netPriceCents = 15000;
    const pricing = calculateTotalPrice(netPriceCents);

    assert.equal(
      pricing.driver_price_cents + pricing.application_fee_cents,
      pricing.total_cents,
      "total_cents = driver_price_cents + application_fee_cents",
    );
    assert.equal(
      pricing.platform_fee_cents + pricing.stripe_fee_cents,
      pricing.application_fee_cents,
      "application_fee_cents = platform_fee_cents + stripe_fee_cents",
    );
  });
});
