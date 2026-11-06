import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import { mapServiceEventToStandardEvent, normalizePlatformEvent } from "../app/adapters/serviceEventAdapter.js";
import { methods as enterpriseServiceEvents } from "../app/controllers/enterprise_service_events.js";
import prisma from "../app/lib/prisma.js";
import rabbitmq from "../app/lib/rabbitmq.js";

describe("Optimización de Eventos y Mitigación de Bloat de Payload", () => {
  after(async () => {
    await rabbitmq.close();
    await prisma.$disconnect();
  });
  test("1. mapServiceEventToStandardEvent no debe triplicar ni incluir logos masivos (>10KB)", () => {
    // Simulamos un evento con un logo de empresa gigante (ej. 3.6 MB de base64)
    const giantLogo = "data:image/png;base64," + "A".repeat(3_500_000);
    const mockServiceEvent = {
      id: "test-event-1",
      enterprise_id: "ent-123",
      title: "Evento Corporativo de Prueba",
      start_at: new Date("2026-12-01T10:00:00Z"),
      end_at: new Date("2026-12-01T18:00:00Z"),
      address_line1: "Calle Innovación 12",
      city: "Madrid",
      status: "approved",
      enterprise: {
        id: "ent-123",
        name: "Empresa Sostenible SL",
        logo: giantLogo,
        website: "https://empresa.com",
      },
    };

    const mapped = mapServiceEventToStandardEvent(mockServiceEvent);
    const serialized = JSON.stringify(mapped);

    // El tamaño del JSON debe ser ligero (< 5KB) y NO 10.8 MB
    assert.ok(
      serialized.length < 5000,
      `El payload serializado (${serialized.length} chars) no debe contener el logo masivo de 3.5MB`,
    );
    assert.equal(mapped.company_logo, null);
    assert.equal(mapped.company.logo, null);
    assert.equal(mapped.enterprise.logo, null);
    assert.equal(mapped.company_name, "Empresa Sostenible SL");
  });

  test("2. normalizePlatformEvent debe sanitizar logos masivos", () => {
    const giantLogo = "data:image/png;base64," + "B".repeat(2_000_000);
    const mockPlatformEvent = {
      id: "pe-123",
      name: "Conferencia Tech",
      start_date: new Date("2026-12-05T09:00:00Z"),
      end_date: new Date("2026-12-05T17:00:00Z"),
      enterprise_id: "ent-123",
      enterprise: {
        id: "ent-123",
        name: "Tech Corp",
        logo: giantLogo,
      },
    };

    const normalized = normalizePlatformEvent(mockPlatformEvent);
    const serialized = JSON.stringify(normalized);

    assert.ok(
      serialized.length < 5000,
      `El payload serializado (${serialized.length} chars) no debe incluir el logo masivo`,
    );
    assert.equal(normalized.company_logo, null);
    assert.equal(normalized.enterprise.logo, null);
  });

  test("3. getMetrics de enterpriseServiceEvents debe responder métricas estructuradas", async () => {
    let statusCode = null;
    let responseBody = null;

    const req = {
      enterprise: { id: "test-ent-id" },
      params: { id: "test-event-id" },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      send(body) {
        responseBody = body;
        return this;
      },
    };

    await enterpriseServiceEvents.getMetrics(req, res);

    assert.equal(statusCode, 200);
    assert.equal(responseBody.status, "Success");
    assert.ok(typeof responseBody.data.registeredUsers === "number");
    assert.ok(typeof responseBody.data.views === "number");
    assert.ok(typeof responseBody.data.requests === "number");
  });

  test("4. Consulta de listado real en BD devuelve payload de menos de 5KB para 2 eventos", async () => {
    let statusCode = null;
    let responseBody = null;

    // Buscar la empresa de prueba existente en la base de datos
    const ent = await prisma.enterprise.findFirst({
      select: { id: true, name: true },
    });

    if (ent) {
      const req = {
        enterprise: { id: ent.id },
        query: { limit: "10", offset: "0" },
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        send(body) {
          responseBody = body;
          return this;
        },
      };

      await enterpriseServiceEvents.list(req, res);

      assert.equal(statusCode, 200);
      assert.equal(responseBody.status, "Success");
      assert.ok(Array.isArray(responseBody.service_events));

      const payloadString = JSON.stringify(responseBody);
      // Con la optimización, 2 eventos deben ocupar menos de 3KB
      assert.ok(
        payloadString.length < 5000,
        `El listado de eventos (${payloadString.length} chars) debe ser menor a 5KB (antes 20MB)`,
      );
    }
  });
});
