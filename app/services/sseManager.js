/**
 * SSEManager (Server-Sent Events)
 * Gestión en memoria de conexiones persistentes para streaming en tiempo real
 * de transacciones, reservas y actualizaciones de saldo.
 */
class SSEManager {
  constructor() {
    /** @type {Map<string, Set<import('express').Response>>} */
    this.clients = new Map();
  }

  /**
   * Registra una nueva conexión SSE para un usuario autenticado.
   *
   * @param {string} userId ID del usuario conectado
   * @param {import('express').Response} res Objeto Response de Express
   */
  addClient(userId, res) {
    const uid = String(userId);

    // Cabeceras estándar SSE con prevención de compresión y buffering de Nginx
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    if (!this.clients.has(uid)) {
      this.clients.set(uid, new Set());
    }
    this.clients.get(uid).add(res);

    // Enviar evento de confirmación de conexión
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`);

    // Heartbeat periódico cada 25 segundos para mantener viva la conexión
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(":ping\n\n");
      }
    }, 25000);

    // Limpieza de recursos al cerrarse la conexión
    res.on("close", () => {
      clearInterval(heartbeat);
      const userConns = this.clients.get(uid);
      if (userConns) {
        userConns.delete(res);
        if (userConns.size === 0) {
          this.clients.delete(uid);
        }
      }
    });
  }

  /**
   * Envía un evento en tiempo real a todas las conexiones activas de un usuario.
   *
   * @param {string} userId ID del usuario destinatario
   * @param {string} eventName Nombre del evento (ej: 'movement.created', 'balance.updated')
   * @param {Object} payload Datos del evento
   * @returns {boolean} True si se envió al menos a un cliente activo
   */
  sendToUser(userId, eventName, payload) {
    const uid = String(userId);
    const userConns = this.clients.get(uid);
    if (!userConns || userConns.size === 0) {
      return false;
    }

    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of userConns) {
      if (!res.writableEnded) {
        res.write(message);
      }
    }
    return true;
  }

  /**
   * Devuelve el número de conexiones activas para un usuario.
   */
  getActiveConnectionsCount(userId) {
    const uid = String(userId);
    return this.clients.get(uid)?.size ?? 0;
  }

  /**
   * Emite un evento a todos los usuarios conectados.
   */
  broadcast(eventName, payload) {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const userConns of this.clients.values()) {
      for (const res of userConns) {
        if (!res.writableEnded) {
          res.write(message);
        }
      }
    }
  }
}

export const sseManager = new SSEManager();
