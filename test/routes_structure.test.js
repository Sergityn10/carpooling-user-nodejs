import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

import rabbitmq from "../app/lib/rabbitmq.js";
import apiRoutes from "../app/routes/index.js";
import webhookRoutes from "../app/routes/webhook.js";
import usersRoutes from "../app/routes/users.js";
import eventsRoutes from "../app/routes/events.js";
import caeReportsRoutes from "../app/routes/cae-reports.js";
import adminRoutes from "../app/routes/admin.js";
import legalConsentsRoutes from "../app/routes/legal-consents.js";
import carsRoutes from "../app/routes/cars.js";
import enterpriseRoutes from "../app/routes/enterprise.js";

const EXPECTED_API_ENDPOINTS = [
  "POST /api/webhook/:source",
  "GET /api/test",
  // Users & /user
  "GET /api/users/",
  "GET /api/users/unique-by-location",
  "GET /api/users/info",
  "POST /api/users/public/batch",
  "PATCH /api/users/",
  "GET /api/users/:id",
  "GET /api/users/:id/info",
  "GET /api/users/:id/public",
  "GET /api/users/:id/profile",
  "PATCH /api/users/:id",
  "DELETE /api/users/:id",
  "GET /api/user/my-organizations",
  // Auth
  "POST /api/auth/unified-login",
  "POST /api/auth/login",
  "GET /api/auth/register/email/:email",
  "POST /api/auth/register",
  "GET /api/auth/logout",
  "POST /api/auth/refresh",
  "GET /api/auth/validate",
  "POST /api/auth/oauth",
  "POST /api/auth/oauth/android",
  "GET /api/auth/oauth/register",
  "GET /api/auth/oauth/login",
  // Enterprise & Enterprises
  "POST /api/enterprise/auth/register",
  "POST /api/enterprise/auth/login",
  "GET /api/enterprise/auth/logout",
  "GET /api/enterprise/auth/validate",
  "POST /api/enterprise/auth/oauth",
  "GET /api/enterprise/auth/oauth/register",
  "GET /api/enterprise/auth/oauth/login",
  "POST /api/enterprise/auth/google",
  "POST /api/enterprise/auth/oauth/google",
  "GET /api/enterprise/me",
  "PATCH /api/enterprise/me",
  "PATCH /api/enterprise/auth/change-password",
  "GET /api/enterprise/metrics",
  "GET /api/enterprise/events",
  "POST /api/enterprise/service-events",
  "GET /api/enterprise/service-events",
  "GET /api/enterprise/service-events/:id",
  "GET /api/enterprise/service-events/:id/metrics",
  "PATCH /api/enterprise/service-events/:id",
  "DELETE /api/enterprise/service-events/:id",
  "GET /api/enterprise/invitations/validate",
  "POST /api/enterprise/invitations/accept",
  "POST /api/enterprise/:enterpriseId/members/invite",
  "GET /api/enterprise/:enterpriseId/members",
  "PATCH /api/enterprise/:enterpriseId/members/:memberId/role",
  "DELETE /api/enterprise/:enterpriseId/members/:memberId",
  "GET /api/enterprise/:enterpriseId/invitations",
  "DELETE /api/enterprise/:enterpriseId/invitations/:invitationId",
  "GET /api/enterprises/:id",
  "PATCH /api/enterprises/:id",
  "PUT /api/enterprises/:id",
  // Telegram Info
  "GET /api/telegram-info/",
  "POST /api/telegram-info/bulk",
  "POST /api/telegram-info/",
  "GET /api/telegram-info/:id",
  "PUT /api/telegram-info/:id",
  "PATCH /api/telegram-info/:id",
  "DELETE /api/telegram-info/:id",
  // Payments, Monedero & Wallet Config (User)
  "POST /api/payment/session",
  "POST /api/payment/stripe-connect",
  "GET /api/payment/stripe-connect",
  "POST /api/payment/stripe-connect-link",
  "GET /api/payment/stripe-connect-link",
  "GET /api/payment/stripe-redirect",
  "POST /api/payment/stripe-customer",
  "GET /api/payment/stripe-customer",
  "POST /api/payment/stripe-link",
  "POST /api/payment/stripe-transfer",
  "POST /api/payment/stripe-login-link",
  "GET /api/payment/stripe-billing-portal",
  "GET /api/payment/cash-balance",
  "GET /api/payment/wallet-balance",
  "GET /api/payment/wallet-transactions",
  "GET /api/payment/movements",
  "GET /api/payment/movements/stream",
  "POST /api/payment/wallet-payout",
  "GET /api/payment/wallet-payouts",
  "POST /api/payment/payout",
  "POST /api/payment/recharge",
  "POST /api/payment/bank_account",
  "POST /api/payment/payment-intent",
  "POST /api/payment/payment-intent/checkout",
  "POST /api/payment/calculate-price",
  "GET /api/payment/cotizar",
  "POST /api/payment/payment-intent/resume",
  "GET /api/payment/payment-intent/:id_reserva/checkout-link",
  "POST /api/payment/payment-intent/capture",
  "POST /api/payment/trayecto/capture",
  "POST /api/payment/auto-capture-expiring",
  "POST /api/payment/payment-intent/cancel",
  "GET /api/monedero/cuenta-vinculada",
  "GET /api/wallet-config/me",
  // Cars
  "GET /api/cars/user/:userId",
  "POST /api/cars/",
  "GET /api/cars/:id",
  "PUT /api/cars/:id",
  "DELETE /api/cars/:id",
  // Routines
  "GET /api/routines/user/:userId/finalidad/:finalidad",
  "GET /api/routines/user/:userId",
  "POST /api/routines/",
  "GET /api/routines/:id",
  "PUT /api/routines/:id",
  "PATCH /api/routines/:id",
  "DELETE /api/routines/:id",
  // Events & Tags
  "GET /api/events/",
  "GET /api/events/nearby",
  "GET /api/events/me/joined",
  "GET /api/events/code/:code",
  "POST /api/events/",
  "GET /api/events/:id",
  "GET /api/events/:id/details",
  "PATCH /api/events/:id",
  "DELETE /api/events/:id",
  "POST /api/events/:id/join",
  "DELETE /api/events/:id/join",
  "GET /api/events/:id/participants",
  "GET /api/events/:id/participants/details",
  "GET /api/tags/",
  "POST /api/tags/",
  "DELETE /api/tags/:id",
  // CAE Reports
  "GET /api/cae-reports/summary",
  "GET /api/cae-reports/",
  "POST /api/cae-reports/",
  "GET /api/cae-reports/:id",
  "PATCH /api/cae-reports/:id/status",
  "DELETE /api/cae-reports/:id",
  "GET /api/cae-reports/:id/export",
  // Companies
  "GET /api/companies/",
  "GET /api/companies/:id",
  "POST /api/companies/",
  "PATCH /api/companies/:id",
  "DELETE /api/companies/:id",
  // Suggestions
  "GET /api/suggestions/",
  "POST /api/suggestions/",
  "GET /api/suggestions/:id",
  "PATCH /api/suggestions/:id",
  "DELETE /api/suggestions/:id",
  "POST /api/suggestions/:id/accept",
  // Legal Consents
  "GET /api/legal-consents/",
  "GET /api/legal-consents/summary",
  "GET /api/legal-consents/me",
  "GET /api/legal-consents/without/:documentType",
  "GET /api/legal-consents/user/:userId",
  // Admin
  "POST /api/admin/enterprises",
  "GET /api/admin/enterprises",
  "GET /api/admin/enterprises/metrics",
  "DELETE /api/admin/enterprises/:id",
  "PATCH /api/admin/enterprises/:id/restore",
  "PATCH /api/admin/enterprises/:id/password",
  "GET /api/admin/wallet-config",
  "GET /api/admin/wallet-config/:userId",
  "PUT /api/admin/wallet-config/:userId",
  "PATCH /api/admin/wallet-config/:userId/toggle",
  "DELETE /api/admin/wallet-config/:userId",
  "GET /api/admin/stripe-connect/:userId",
  "POST /api/admin/stripe-connect/:userId",
  "POST /api/admin/stripe-connect/:userId/account-link",
  "POST /api/admin/stripe-connect/:userId/login-link",
  "GET /api/admin/accounts",
  "POST /api/admin/accounts",
  "POST /api/admin/accounts/sync/:userId",
  "GET /api/admin/accounts/:stripeAccountId",
  "PATCH /api/admin/accounts/:stripeAccountId",
  "DELETE /api/admin/accounts/:stripeAccountId",
];

const KNOWN_API_SUBPREFIXES = [
  "/auth",
  "/users",
  "/user",
  "/enterprise",
  "/enterprises",
  "/events",
  "/tags",
  "/payment",
  "/monedero",
  "/wallet-config",
  "/cars",
  "/routines",
  "/cae-reports",
  "/companies",
  "/suggestions",
  "/legal-consents",
  "/telegram-info",
  "/admin",
];

function normalizeRouteKey(method, fullPath) {
  const clean = fullPath.replace(/\/+/g, "/");
  return `${method.toUpperCase()} ${clean}`;
}

function normalizeForCompare(routeStr) {
  const [method, path] = routeStr.split(" ");
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return `${method} ${trimmed}`;
}

function extractRoutesFromRouter(router, basePrefix) {
  const collected = [];
  for (const layer of router.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(
        (m) => layer.route.methods[m],
      );
      for (const method of methods) {
        collected.push(normalizeRouteKey(method, `${basePrefix}${layer.route.path}`));
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      const matchedPrefix = KNOWN_API_SUBPREFIXES.find(
        (p) => layer.match?.(p) === true,
      );
      assert.ok(
        matchedPrefix,
        `No se pudo resolver el prefijo para un sub-router montado en ${basePrefix}`,
      );
      collected.push(
        ...extractRoutesFromRouter(layer.handle, `${basePrefix}${matchedPrefix}`),
      );
    }
  }
  return collected;
}

function getOrderedRoutePaths(router) {
  const list = [];
  for (const layer of router.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(
        (m) => layer.route.methods[m],
      );
      for (const m of methods) {
        list.push(`${m.toUpperCase()} ${layer.route.path}`);
      }
    }
  }
  return list;
}

function makeRequest(server, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("Estructura Modular de Rutas (app/routes/)", () => {
  let app;
  let server;

  before(async () => {
    process.env.NODE_ENV = "test";
    ({ default: app } = await import("../app/index.js"));
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await rabbitmq.close();
  });

  it("debe registrar exactamente los 169 endpoints /api/* esperados sin duplicados ni omisiones", () => {
    const actualRoutes = [
      ...extractRoutesFromRouter(webhookRoutes, "/api/webhook"),
      ...extractRoutesFromRouter(apiRoutes, "/api"),
    ];

    const normalizedExpected = EXPECTED_API_ENDPOINTS.map(normalizeForCompare);
    const normalizedActual = actualRoutes.map(normalizeForCompare);

    assert.equal(
      new Set(normalizedActual).size,
      normalizedActual.length,
      "Se detectaron rutas duplicadas en la configuración modular",
    );

    const missing = normalizedExpected.filter(
      (r) => !normalizedActual.includes(r),
    );
    const unexpected = normalizedActual.filter(
      (r) => !normalizedExpected.includes(r),
    );

    assert.deepEqual(missing, [], `Faltan rutas por montar: ${missing.join(", ")}`);
    assert.deepEqual(
      unexpected,
      [],
      `Se encontraron rutas inesperadas: ${unexpected.join(", ")}`,
    );
    assert.equal(normalizedActual.length, 169);
  });

  it("debe mantener las rutas estáticas antes que las parametrizadas en cada router", () => {
    const usersOrder = getOrderedRoutePaths(usersRoutes);
    assert.ok(
      usersOrder.indexOf("GET /unique-by-location") <
        usersOrder.indexOf("GET /:id"),
    );
    assert.ok(usersOrder.indexOf("GET /info") < usersOrder.indexOf("GET /:id"));

    const eventsOrder = getOrderedRoutePaths(eventsRoutes);
    assert.ok(
      eventsOrder.indexOf("GET /nearby") < eventsOrder.indexOf("GET /:id"),
    );
    assert.ok(
      eventsOrder.indexOf("GET /me/joined") < eventsOrder.indexOf("GET /:id"),
    );

    const caeOrder = getOrderedRoutePaths(caeReportsRoutes);
    assert.ok(caeOrder.indexOf("GET /summary") < caeOrder.indexOf("GET /:id"));

    const adminOrder = getOrderedRoutePaths(adminRoutes);
    assert.ok(
      adminOrder.indexOf("GET /enterprises/metrics") <
        adminOrder.indexOf("DELETE /enterprises/:id"),
    );
    assert.ok(
      adminOrder.indexOf("POST /accounts/sync/:userId") <
        adminOrder.indexOf("GET /accounts/:stripeAccountId"),
    );

    const consentsOrder = getOrderedRoutePaths(legalConsentsRoutes);
    assert.ok(
      consentsOrder.indexOf("GET /summary") <
        consentsOrder.indexOf("GET /without/:documentType"),
    );

    const carsOrder = getOrderedRoutePaths(carsRoutes);
    assert.ok(
      carsOrder.indexOf("GET /user/:userId") < carsOrder.indexOf("GET /:id"),
    );

    const entOrder = getOrderedRoutePaths(enterpriseRoutes);
    assert.ok(
      entOrder.indexOf("GET /invitations/validate") <
        entOrder.indexOf("GET /:enterpriseId/invitations"),
    );
  });

  it("debe servir /health, CORS preflight y 404 ROUTE_NOT_FOUND correctamente en app/index.js", async () => {
    const healthRes = await makeRequest(server, {
      method: "GET",
      path: "/health",
    });
    assert.equal(healthRes.status, 200);
    const healthJson = JSON.parse(healthRes.body);
    assert.equal(healthJson.status, "ok");
    assert.equal(healthJson.service, "carpooling-user");

    const corsRes = await makeRequest(server, {
      method: "OPTIONS",
      path: "/api/events?page=1&limit=6",
      headers: {
        Origin: "https://app.youconnext.es",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(corsRes.status, 204);
    assert.equal(
      corsRes.headers["access-control-allow-origin"],
      "https://app.youconnext.es",
    );

    const notFoundRes = await makeRequest(server, {
      method: "GET",
      path: "/api/ruta-inexistente-xyz",
    });
    assert.equal(notFoundRes.status, 404);
  });

  it("debe enrutar correctamente peticiones protegidas hacia sus middlewares de autorización", async () => {
    const userInfoRes = await makeRequest(server, {
      method: "GET",
      path: "/api/users/info",
    });
    assert.equal(userInfoRes.status, 401);

    const adminMetricsRes = await makeRequest(server, {
      method: "GET",
      path: "/api/admin/enterprises/metrics",
    });
    assert.equal(adminMetricsRes.status, 401);

    const myOrgsRes = await makeRequest(server, {
      method: "GET",
      path: "/api/user/my-organizations",
    });
    assert.equal(myOrgsRes.status, 401);
  });

  it("debe preservar rawBody Buffer para /api/webhook/stripe antes de express.json()", async () => {
    let capturedIsBuffer = false;
    let capturedOriginalUrl = "";
    const testApp = express();
    testApp.use("/api/webhook", (req, res, next) => {
      webhookRoutes(req, res, next);
    });

    // Verificamos directamente que el middleware interno de webhookRoutes convierte a Buffer
    const probeApp = express();
    probeApp.use(
      "/api/webhook",
      webhookRoutes.stack[0].handle,
      (req, res) => {
        capturedIsBuffer = Buffer.isBuffer(req.body);
        capturedOriginalUrl = req.originalUrl;
        res.status(200).json({ ok: true });
      },
    );
    probeApp.use(express.json());

    const probeServer = await new Promise((resolve) => {
      const s = probeApp.listen(0, "127.0.0.1", () => resolve(s));
    });

    try {
      const payload = JSON.stringify({ id: "evt_test_123" });
      const res = await makeRequest(probeServer, {
        method: "POST",
        path: "/api/webhook/stripe",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        body: payload,
      });
      assert.equal(res.status, 200);
      assert.equal(capturedOriginalUrl, "/api/webhook/stripe");
      assert.equal(capturedIsBuffer, true);
    } finally {
      await new Promise((resolve) => probeServer.close(resolve));
    }
  });
});
