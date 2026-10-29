import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sseManager } from "../../app/services/sseManager.js";
import { EventEmitter } from "node:events";

describe("Streaming en Tiempo Real con Server-Sent Events (sseManager)", () => {
  it("debe registrar clientes y configurar las cabeceras HTTP SSE obligatorias", () => {
    const mockRes = new EventEmitter();
    let writtenHeaders = {};
    let writtenChunks = [];

    mockRes.writeHead = (statusCode, headers) => {
      mockRes.statusCode = statusCode;
      writtenHeaders = headers;
    };
    mockRes.write = (chunk) => {
      writtenChunks.push(chunk);
    };

    sseManager.addClient("user-stream-test-01", mockRes);

    assert.equal(mockRes.statusCode, 200);
    assert.equal(writtenHeaders["Content-Type"], "text/event-stream");
    assert.equal(writtenHeaders["Cache-Control"], "no-cache, no-transform");
    assert.equal(writtenHeaders["Connection"], "keep-alive");
    assert.ok(writtenChunks.some((c) => c.includes("event: connected")));
    assert.equal(sseManager.getActiveConnectionsCount("user-stream-test-01"), 1);

    // Simular desconexión
    mockRes.emit("close");
    assert.equal(sseManager.getActiveConnectionsCount("user-stream-test-01"), 0);
  });

  it("debe enviar eventos dirigidos exclusivamente al usuario correspondiente", () => {
    const resUserA = new EventEmitter();
    const resUserB = new EventEmitter();
    const chunksA = [];
    const chunksB = [];

    resUserA.writeHead = () => {};
    resUserA.write = (chunk) => chunksA.push(chunk);

    resUserB.writeHead = () => {};
    resUserB.write = (chunk) => chunksB.push(chunk);

    sseManager.addClient("user-A", resUserA);
    sseManager.addClient("user-B", resUserB);

    const eventPayload = {
      type: "reservation_revenue",
      amount_cents: 1500,
      currency: "eur",
      id_reserva: "res-001",
    };

    const delivered = sseManager.sendToUser("user-A", "movement.created", eventPayload);
    assert.equal(delivered, true);

    // User A debe haber recibido el evento
    assert.ok(chunksA.some((c) => c.includes("event: movement.created")));
    assert.ok(chunksA.some((c) => c.includes('"amount_cents":1500')));

    // User B NO debe haber recibido nada de user-A
    assert.ok(!chunksB.some((c) => c.includes("movement.created")));

    // Limpieza
    resUserA.emit("close");
    resUserB.emit("close");
  });
});
