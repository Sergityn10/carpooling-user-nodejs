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

async function getCAEBalance(userToken) {
  try {
    const response = await fetch(`${TRAYECTOS_ORIGIN}/api/cae/balance`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    if (!response.ok) {
      console.error(
        `[trayectosService] getCAEBalance ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getCAEBalance error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getDriverStats(userId, userToken) {
  try {
    const [tripsResponse, caeResponse] = await Promise.all([
      fetch(`${TRAYECTOS_ORIGIN}/api/trayecto/conductor/${userId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      }),
      userToken
        ? fetch(`${TRAYECTOS_ORIGIN}/api/cae/balance`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
          })
        : Promise.resolve(null),
    ]);

    let completedTrips = 0;
    if (tripsResponse.ok) {
      const tripsData = await tripsResponse.json();
      const trips = Array.isArray(tripsData)
        ? tripsData
        : (tripsData.trayectos ?? []);
      completedTrips = trips.filter((t) => t.status === "finalizado").length;
    } else {
      console.error(
        `[trayectosService] getDriverStats trips ${tripsResponse.status}: ${await tripsResponse.text()}`,
      );
    }

    let totalKwh = 0;
    let totalEur = 0;
    if (caeResponse && caeResponse.ok) {
      const caeData = await caeResponse.json();
      const detalles = caeData.detalles ?? [];
      for (const d of detalles) {
        totalKwh += Number(d.kwh_generated ?? 0);
        totalEur += Number(d.eur_generated ?? 0);
      }
    } else if (caeResponse) {
      console.error(
        `[trayectosService] getDriverStats cae ${caeResponse.status}: ${await caeResponse.text()}`,
      );
    }

    return {
      completed_trips: completedTrips,
      kwh_generated: Math.round(totalKwh * 100) / 100,
      eur_generated: Math.round(totalEur * 100) / 100,
    };
  } catch (error) {
    console.error(
      "[trayectosService] getDriverStats error:",
      error?.message ?? error,
    );
    return { completed_trips: 0, kwh_generated: 0, eur_generated: 0 };
  }
}

export const trayectosService = {
  updateReservaStatus,
  confirmReservaSuccess,
  cancelReserva,
  getCAEBalance,
  getDriverStats,
};
