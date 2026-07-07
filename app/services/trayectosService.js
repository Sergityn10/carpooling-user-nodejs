import jsonwebtoken from "jsonwebtoken";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

const TRAYECTOS_ORIGIN = (
  process.env.TRAYECTOS_ORIGIN || "http://localhost:4001"
).replace(/\/$/, "");

function generateServiceToken() {
  return jsonwebtoken.sign(
    { service: "carpooling-user", type: "service" },
    PRIVATE_KEY,
    { expiresIn: "5m", algorithm: JWT_ALGORITHM },
  );
}

async function updateReservaStatus(id_reserva, status, payment_intent_id) {
  try {
    const token = generateServiceToken();
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/reserva/${id_reserva}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          payment_intent_id: payment_intent_id || undefined,
        }),
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] updateReservaStatus ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] updateReservaStatus error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function confirmReservaSuccess(id_reserva) {
  try {
    const token = generateServiceToken();
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/reserva/${id_reserva}/success`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] confirmReservaSuccess ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] confirmReservaSuccess error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function cancelReserva(id_reserva) {
  try {
    const token = generateServiceToken();
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/reserva/${id_reserva}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] cancelReserva ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] cancelReserva error:",
      error?.message ?? error,
    );
    return null;
  }
}

export const trayectosService = {
  updateReservaStatus,
  confirmReservaSuccess,
  cancelReserva,
};
