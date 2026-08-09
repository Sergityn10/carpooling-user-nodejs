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

async function getAllCAEs(adminToken, status) {
  try {
    const params = new URLSearchParams({ limit: "10000" });
    if (status) params.set("status", status);
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/cae?${params.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getAllCAEs ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getAllCAEs error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getTripPassengers(travelId, adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/reserva/trayectoId/${travelId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getTripPassengers ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getTripPassengers error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getTripRecorrido(travelId, adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/trayecto/${travelId}/recorrido`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getTripRecorrido ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getTripRecorrido error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getTripById(travelId, adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/trayecto/${travelId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getTripById ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getTripById error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getCAEReportsSummary(adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/cae/reports/summary`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getCAEReportsSummary ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getCAEReportsSummary error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getCAEReports(adminToken, status, page = 1, limit = 50) {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) params.set("status", status);
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/cae/reports?${params.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getCAEReports ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getCAEReports error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function createCAEReport(adminToken, name) {
  try {
    const body = {};
    if (name) body.name = name;
    const response = await fetch(`${TRAYECTOS_ORIGIN}/api/cae/reports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(
        `[trayectosService] createCAEReport ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] createCAEReport error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function getCAEReportById(reportId, adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/cae/reports/${reportId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] getCAEReportById ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] getCAEReportById error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function updateCAEReportStatus(reportId, status, adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/cae/reports/${reportId}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] updateCAEReportStatus ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] updateCAEReportStatus error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function deleteCAEReport(reportId, adminToken) {
  try {
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/cae/reports/${reportId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] deleteCAEReport ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[trayectosService] deleteCAEReport error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function countConductorTrips(userId) {
  try {
    const token = generateServiceToken();
    const response = await fetch(
      `${TRAYECTOS_ORIGIN}/api/trayecto/conductor/${userId}?limit=1`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) {
      console.error(
        `[trayectosService] countConductorTrips ${response.status}: ${await response.text()}`,
      );
      return 0;
    }
    const data = await response.json();
    return data?.pagination?.total ?? 0;
  } catch (error) {
    console.error(
      "[trayectosService] countConductorTrips error:",
      error?.message ?? error,
    );
    return 0;
  }
}

async function getDriverStats(userId, userToken) {
  try {
    const token = generateServiceToken();
    const [tripsResponse, caeResponse] = await Promise.all([
      fetch(`${TRAYECTOS_ORIGIN}/api/trayecto/conductor/${userId}?limit=100`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
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
      const trips = tripsData.data ?? [];
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
  countConductorTrips,
  getAllCAEs,
  getTripPassengers,
  getTripRecorrido,
  getTripById,
  getCAEReportsSummary,
  getCAEReports,
  createCAEReport,
  getCAEReportById,
  updateCAEReportStatus,
  deleteCAEReport,
};
