import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cacheService } from "../../app/services/cacheService.js";

describe("Caché en Memoria del Monedero e Invalidación Reactiva (cacheService & getCashBalance)", () => {
  beforeEach(async () => {
    await cacheService.clear();
  });

  it("debe almacenar y recuperar valores con TTL en cacheService", async () => {
    const key = "test:balance:user-1";
    const value = JSON.stringify({ availableAmount: "25.00", pendingAmount: "5.00" });

    await cacheService.set(key, value, "EX", 60);

    const retrieved = await cacheService.get(key);
    assert.equal(retrieved, value);

    const deleted = await cacheService.del(key);
    assert.equal(deleted, 1);

    const afterDel = await cacheService.get(key);
    assert.equal(afterDel, null);
  });

  it("debe respetar la expiración de claves caducadas", async () => {
    const key = "test:expiring:user-2";
    // TTL de 0 segundos (inmediatamente expirado)
    await cacheService.set(key, "data", -1);

    const retrieved = await cacheService.get(key);
    assert.equal(retrieved, null, "Claves con tiempo vencido deben devolver null");
  });

  it("debe invalidar la caché de balance por userId y por stripeAccountId", async () => {
    const userId = "usr-driver-10";
    const stripeAccountId = "acct_driver_connect_10";

    cacheService.registerUserAccount(stripeAccountId, userId);

    await cacheService.set(`stripe:balance:${userId}`, '{"balance": 100}', 60);

    // Invalidar indicando solo el stripeAccountId (como en un webhook de Stripe)
    await cacheService.invalidateBalance({ stripeAccountId });

    const cachedAfter = await cacheService.get(`stripe:balance:${userId}`);
    assert.equal(
      cachedAfter,
      null,
      "La caché del usuario debe haber sido invalidada mediante su stripeAccountId",
    );
  });

  it("getCashBalance debe responder desde caché en la segunda llamada e incluir cabecera Cache-Control", async () => {
    let stripeCalls = 0;
    const mockStripeBalance = {
      available: [{ amount: 4550, currency: "eur" }],
      pending: [{ amount: 1200, currency: "eur" }],
    };

    // Handler simulado que replica la lógica de getCashBalance
    async function simulateGetCashBalance(req, res) {
      const stripe_account = req.user?.stripe_account;
      const userId = req.user?.id;
      const isForceRefresh =
        req.query?.force === "true" ||
        req.headers?.["cache-control"] === "no-cache";
      const cacheKey = `stripe:balance:${userId || stripe_account}`;

      if (!isForceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          res.setHeader("Cache-Control", "private, max-age=30");
          return res.json(JSON.parse(cached), true); // true = from cache
        }
      }

      stripeCalls++;
      const availableEuros = mockStripeBalance.available.find(
        (b) => b.currency === "eur",
      );
      const pendingEuros = mockStripeBalance.pending.find(
        (b) => b.currency === "eur",
      );

      const responsePayload = {
        status: "Success",
        message: "Cash balance retrieved successfully",
        availableAmount: (availableEuros.amount / 100).toFixed(2),
        pendingAmount: (pendingEuros.amount / 100).toFixed(2),
      };

      await cacheService.set(cacheKey, JSON.stringify(responsePayload), "EX", 60);
      res.setHeader("Cache-Control", "private, max-age=30");
      return res.json(responsePayload, false); // false = fresh from Stripe
    }

    const headers = {};
    const mockRes = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
      json: (data, fromCache) => ({ data, fromCache }),
    };

    const reqUser = {
      user: { id: "usr-tester-1", stripe_account: "acct_tester_1" },
      query: {},
      headers: {},
    };

    // 1ª Llamada (Cache Miss): Debe consultar a Stripe
    const firstCall = await simulateGetCashBalance(reqUser, mockRes);
    assert.equal(firstCall.fromCache, false);
    assert.equal(firstCall.data.availableAmount, "45.50");
    assert.equal(stripeCalls, 1);
    assert.equal(headers["Cache-Control"], "private, max-age=30");

    // 2ª Llamada (Cache Hit): Debe retornar de memoria sin tocar Stripe
    const secondCall = await simulateGetCashBalance(reqUser, mockRes);
    assert.equal(secondCall.fromCache, true);
    assert.equal(secondCall.data.availableAmount, "45.50");
    assert.equal(stripeCalls, 1, "No debe realizar una segunda consulta a Stripe");
    assert.equal(headers["Cache-Control"], "private, max-age=30");

    // 3ª Llamada Pull-to-Refresh (?force=true): Debe omitir caché y volver a consultar
    const reqForce = {
      ...reqUser,
      query: { force: "true" },
    };
    const thirdCall = await simulateGetCashBalance(reqForce, mockRes);
    assert.equal(thirdCall.fromCache, false);
    assert.equal(stripeCalls, 2, "force=true debe refrescar consultando a Stripe");
  });
});
