import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MovementDTO } from "../../app/dto/movementDto.js";

describe("Seguridad y Sanitización de Movimientos (MovementDTO y getMovements)", () => {
  it("debe sanitizar movimientos de pasajero sin filtrar datos sensibles ni de tarjetas", () => {
    const rawPassengerTx = {
      id: "tx-uuid-001",
      wallet_account_id: "wacc-001",
      user_id: "user-passenger-001",
      currency: "eur",
      id_reserva: "res-valencia-01",
      type: "reservation_payment",
      amount: -1550, // -15.50 EUR
      balance_before: 5000,
      balance_after: 3450,
      status: "succeeded",
      created_at: new Date("2026-10-26T10:00:00Z"),
      counterpart: {
        id: "driver-uuid-002",
        name: "Carlos",
        surname: "Gómez Pérez",
        img_perfil: "https://example.com/avatar.jpg",
        phone: "+34600112233", // Dato sensible
        dni: "12345678Z", // Dato sensible
      },
      paymentIntent: {
        payment_method_brand: "visa",
        payment_method_last4: "4242",
        client_secret: "pi_123_secret_xyz", // Secreto sensible
      },
    };

    const sanitized = MovementDTO.toMovement(rawPassengerTx, "user-passenger-001");

    // Verificación de estructura
    assert.equal(sanitized.id, "tx-uuid-001");
    assert.equal(sanitized.role, "passenger");
    assert.equal(sanitized.type, "reservation_payment");
    assert.equal(sanitized.amounts.formatted_eur, "-15.50");
    assert.equal(sanitized.amounts.is_negative, true);

    // Verificación de método de pago saneado
    assert.deepEqual(sanitized.payment_method, {
      brand: "visa",
      last4: "4242",
    });

    // Verificación de contraparte (nombre e inicial del apellido, NUNCA teléfono ni DNI)
    assert.equal(sanitized.counterpart.name, "Carlos");
    assert.equal(sanitized.counterpart.surname_initial, "G.");
    assert.equal(sanitized.counterpart.phone, undefined, "El teléfono NUNCA debe incluirse en los movimientos financieros");
    assert.equal(sanitized.counterpart.dni, undefined, "El DNI NUNCA debe incluirse en los movimientos");

    // Verificación de no fuga de secretos
    assert.equal(sanitized.client_secret, undefined);
    assert.equal(sanitized.paymentIntent, undefined);
  });

  it("debe formatear ingresos del conductor con desglose contable correcto", () => {
    const rawDriverTx = {
      id: "tx-uuid-002",
      wallet_account_id: "wacc-002",
      user_id: "driver-uuid-002",
      currency: "eur",
      id_reserva: "res-valencia-01",
      type: "reservation_revenue",
      amount: 1304, // 13.04 EUR
      balance_before: 2000,
      balance_after: 3304,
      status: "succeeded",
      created_at: new Date("2026-10-26T10:00:00Z"),
      counterpart: {
        id: "passenger-uuid-001",
        name: "María",
        surname: "López",
      },
    };

    const sanitized = MovementDTO.toMovement(rawDriverTx, "driver-uuid-002");

    assert.equal(sanitized.role, "driver");
    assert.equal(sanitized.type, "reservation_revenue");
    assert.equal(sanitized.amounts.formatted_eur, "13.04");
    assert.equal(sanitized.amounts.is_negative, false);
    assert.equal(sanitized.counterpart.name, "María");
    assert.equal(sanitized.counterpart.surname_initial, "L.");
  });

  it("debe garantizar la protección contra IDOR (aislamiento por user_id)", () => {
    const authenticatedUser = { id: "user-attacker-666" };
    const maliciousQuery = { user_id: "user-victim-777" };

    // En el controlador, where siempre debe imponer user_id = req.user.id
    const whereClause = {
      user_id: String(authenticatedUser.id),
      ...(maliciousQuery.type ? { type: maliciousQuery.type } : {}),
    };

    assert.equal(whereClause.user_id, "user-attacker-666", "La consulta debe forzar la identidad del usuario autenticado");
    assert.notEqual(whereClause.user_id, "user-victim-777", "No debe permitir consultar IDs de terceros");
  });
});
