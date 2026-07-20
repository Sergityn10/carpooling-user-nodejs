import ExcelJS from "exceljs";
import prisma from "../lib/prisma.js";
import { trayectosService } from "../services/trayectosService.js";
import { methods as cryptoUtils } from "../utils/crypto.js";

async function generateCAEReport(req, res) {
  try {
    const adminToken =
      req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;

    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }

    const { status } = req.query;

    const caeData = await trayectosService.getAllCAEs(adminToken, status);
    if (!caeData) {
      return res
        .status(502)
        .send({ status: "Error", message: "Error fetching CAEs from trayectos service" });
    }

    const caeItems = caeData.items ?? [];
    if (caeItems.length === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "No CAEs found with the specified criteria" });
    }

    const conductorIds = [...new Set(caeItems.map((c) => c.conductor).filter(Boolean))];

    const users = await prisma.user.findMany({
      where: { id: { in: conductorIds } },
      select: {
        id: true,
        name: true,
        phone: true,
        dni: true,
        email: true,
        cars: {
          select: {
            matricula: true,
            marca: true,
            modelo: true,
            color: true,
            tipo_combustible: true,
            num_plazas: true,
            year: true,
          },
        },
      },
    });

    const userMap = new Map();
    for (const u of users) {
      const decrypted = cryptoUtils.decryptFields(u, ["name", "phone", "dni"]);
      userMap.set(u.id, decrypted);
    }

    const tripDetailsMap = new Map();
    const passengerDataMap = new Map();
    const recorridoDataMap = new Map();

    const batchSize = 5;
    for (let i = 0; i < caeItems.length; i += batchSize) {
      const batch = caeItems.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (cae) => {
          const tripId = cae.id_trayecto;
          const [tripDetail, passengers, recorrido] = await Promise.all([
            trayectosService.getTripById(tripId, adminToken),
            trayectosService.getTripPassengers(tripId, adminToken),
            trayectosService.getTripRecorrido(tripId, adminToken),
          ]);
          return { cae, tripDetail, passengers, recorrido };
        }),
      );

      for (const r of results) {
        tripDetailsMap.set(r.cae.id_trayecto, r.tripDetail);
        passengerDataMap.set(r.cae.id_trayecto, r.passengers);
        recorridoDataMap.set(r.cae.id_trayecto, r.recorrido);
      }
    }

    const allPassengerUserIds = new Set();
    for (const [, passengers] of passengerDataMap) {
      const list = passengers?.pasajerosList ?? [];
      for (const p of list) {
        if (p.user_id) allPassengerUserIds.add(p.user_id);
      }
    }

    const passengerUsers = await prisma.user.findMany({
      where: { id: { in: [...allPassengerUserIds] } },
      select: { id: true, name: true, phone: true, dni: true },
    });

    const passengerUserMap = new Map();
    for (const u of passengerUsers) {
      const decrypted = cryptoUtils.decryptFields(u, ["name", "phone", "dni"]);
      passengerUserMap.set(u.id, decrypted);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "YouConnext Admin";
    workbook.created = new Date();

    // ─── Sheet 1: Resumen ───
    const summarySheet = workbook.addWorksheet("Resumen", {
      properties: { tabColor: "1F4E79" },
    });

    const totalTrips = caeItems.length;
    const totalKm = caeItems.reduce((s, c) => s + Number(c.km_recorridos ?? 0), 0);
    const totalKmCompany = caeItems.reduce(
      (s, c) => s + Number(c.km_with_company ?? 0),
      0,
    );
    const totalKwh = caeItems.reduce((s, c) => s + Number(c.kwh_generated ?? 0), 0);
    const totalEur = caeItems.reduce((s, c) => s + Number(c.eur_generated ?? 0), 0);
    const statusCounts = {};
    for (const c of caeItems) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    }

    summarySheet.columns = [
      { header: "Métrica", key: "metric", width: 40 },
      { header: "Valor", key: "value", width: 25 },
    ];

    summarySheet.addRow({ metric: "Total de informes CAE", value: totalTrips });
    summarySheet.addRow({ metric: "Total KM recorridos", value: Math.round(totalKwh * 100) / 100 });
    summarySheet.addRow({
      metric: "Total KM con pasajeros",
      value: Math.round(totalKmCompany * 100) / 100,
    });
    summarySheet.addRow({
      metric: "Total kWh generados",
      value: Math.round(totalKwh * 100) / 100,
    });
    summarySheet.addRow({
      metric: "Total EUR generados",
      value: Math.round(totalEur * 100) / 100,
    });
    summarySheet.addRow({ metric: "", value: "" });
    summarySheet.addRow({ metric: "Informes por estado", value: "" });
    for (const [st, count] of Object.entries(statusCounts)) {
      summarySheet.addRow({ metric: `  ${st}`, value: count });
    }

    styleHeaderRow(summarySheet);

    // ─── Sheet 2: Viajes ───
    const tripsSheet = workbook.addWorksheet("Viajes", {
      properties: { tabColor: "2E75B6" },
    });

    tripsSheet.columns = [
      { header: "ID CAE", key: "cae_id", width: 36 },
      { header: "ID Trayecto", key: "trip_id", width: 36 },
      { header: "Origen", key: "origen", width: 30 },
      { header: "Destino", key: "destino", width: 30 },
      { header: "Fecha/Hora", key: "hora", width: 22 },
      { header: "Estado CAE", key: "cae_status", width: 14 },
      { header: "Conductor ID", key: "conductor_id", width: 36 },
      { header: "Conductor Nombre", key: "conductor_name", width: 25 },
      { header: "Conductor DNI/NIE", key: "conductor_dni", width: 20 },
      { header: "Conductor Teléfono", key: "conductor_phone", width: 18 },
      { header: "Conductor Email", key: "conductor_email", width: 30 },
      { header: "Matrícula", key: "matricula", width: 12 },
      { header: "Marca", key: "marca", width: 15 },
      { header: "Modelo", key: "modelo", width: 15 },
      { header: "Color", key: "color", width: 12 },
      { header: "Combustible", key: "combustible", width: 14 },
      { header: "Num. Plazas", key: "num_plazas", width: 12 },
      { header: "Año", key: "year", width: 8 },
      { header: "KM Recorridos", key: "km_recorridos", width: 14 },
      { header: "KM con Pasajeros", key: "km_with_company", width: 16 },
      { header: "kWh Generados", key: "kwh_generated", width: 14 },
      { header: "EUR Generados", key: "eur_generated", width: 14 },
      { header: "CAE Creado", key: "cae_created", width: 22 },
      { header: "CAE Actualizado", key: "cae_updated", width: 22 },
    ];

    for (const cae of caeItems) {
      const trip = tripDetailsMap.get(cae.id_trayecto);
      const conductor = userMap.get(cae.conductor);
      const car = conductor?.cars?.[0];

      tripsSheet.addRow({
        cae_id: cae.id,
        trip_id: cae.id_trayecto,
        origen: cae.origen ?? trip?.origen ?? "",
        destino: cae.destino ?? trip?.destino ?? "",
        hora: cae.hora ?? trip?.hora ?? "",
        cae_status: cae.status,
        conductor_id: cae.conductor ?? "",
        conductor_name: conductor?.name ?? "N/D",
        conductor_dni: conductor?.dni ?? "N/D",
        conductor_phone: conductor?.phone ?? "N/D",
        conductor_email: conductor?.email ?? "",
        matricula: car?.matricula ?? "N/D",
        marca: car?.marca ?? "",
        modelo: car?.modelo ?? "",
        color: car?.color ?? "",
        combustible: car?.tipo_combustible ?? "",
        num_plazas: car?.num_plazas ?? "",
        year: car?.year ?? "",
        km_recorridos: cae.km_recorridos,
        km_with_company: cae.km_with_company,
        kwh_generated: cae.kwh_generated,
        eur_generated: cae.eur_generated,
        cae_created: cae.created_at,
        cae_updated: cae.updated_at,
      });
    }

    styleHeaderRow(tripsSheet);

    // ─── Sheet 3: Viajeros ───
    const passengersSheet = workbook.addWorksheet("Viajeros", {
      properties: { tabColor: "70AD47" },
    });

    passengersSheet.columns = [
      { header: "ID Trayecto", key: "trip_id", width: 36 },
      { header: "Fecha/Hora Viaje", key: "hora", width: 22 },
      { header: "Origen", key: "origen", width: 30 },
      { header: "Destino", key: "destino", width: 30 },
      { header: "Usuario ID", key: "user_id", width: 36 },
      { header: "Nombre", key: "name", width: 25 },
      { header: "DNI/NIE", key: "dni", width: 20 },
      { header: "Teléfono", key: "phone", width: 18 },
      { header: "Rol", key: "rol", width: 12 },
      { header: "Matrícula", key: "matricula", width: 12 },
      { header: "Estado Reserva", key: "reserva_status", width: 16 },
      { header: "Confirmación Viaje", key: "trip_outcome", width: 18 },
      { header: "ID Reserva", key: "id_reserva", width: 36 },
    ];

    for (const cae of caeItems) {
      const trip = tripDetailsMap.get(cae.id_trayecto);
      const conductor = userMap.get(cae.conductor);
      const car = conductor?.cars?.[0];

      passengersSheet.addRow({
        trip_id: cae.id_trayecto,
        hora: cae.hora ?? trip?.hora ?? "",
        origen: cae.origen ?? trip?.origen ?? "",
        destino: cae.destino ?? trip?.destino ?? "",
        user_id: cae.conductor ?? "",
        name: conductor?.name ?? "N/D",
        dni: conductor?.dni ?? "N/D",
        phone: conductor?.phone ?? "N/D",
        rol: "Conductor",
        matricula: car?.matricula ?? "N/D",
        reserva_status: "",
        trip_outcome: "",
        id_reserva: "",
      });

      const passengersResp = passengerDataMap.get(cae.id_trayecto);
      const passengers = passengersResp?.pasajerosList ?? [];
      for (const p of passengers) {
        const pUser = passengerUserMap.get(p.user_id);
        passengersSheet.addRow({
          trip_id: cae.id_trayecto,
          hora: cae.hora ?? trip?.hora ?? "",
          origen: cae.origen ?? trip?.origen ?? "",
          destino: cae.destino ?? trip?.destino ?? "",
          user_id: p.user_id ?? "",
          name: pUser?.name ?? p.nombre ?? "N/D",
          dni: pUser?.dni ?? "N/D",
          phone: pUser?.phone ?? "N/D",
          rol: "Pasajero",
          matricula: car?.matricula ?? "N/D",
          reserva_status: p.status ?? "",
          trip_outcome: p.trip_outcome ?? "",
          id_reserva: p.id_reserva ?? "",
        });
      }
    }

    styleHeaderRow(passengersSheet);

    // ─── Sheet 4: Trazado (Geolocalización) ───
    const trackingSheet = workbook.addWorksheet("Trazado", {
      properties: { tabColor: "FFC000" },
    });

    trackingSheet.columns = [
      { header: "ID Trayecto", key: "trip_id", width: 36 },
      { header: "Usuario ID", key: "user_id", width: 36 },
      { header: "Latitud", key: "lat", width: 14 },
      { header: "Longitud", key: "lng", width: 14 },
      { header: "Dirección", key: "address", width: 40 },
      { header: "Timestamp", key: "created_at", width: 22 },
    ];

    for (const cae of caeItems) {
      const recorridoResp = recorridoDataMap.get(cae.id_trayecto);
      const recorridos = recorridoResp?.recorridos ?? [];
      for (const r of recorridos) {
        trackingSheet.addRow({
          trip_id: cae.id_trayecto,
          user_id: r.user_id ?? "",
          lat: r.lat,
          lng: r.lng,
          address: r.address ?? "",
          created_at: r.created_at,
        });
      }
    }

    styleHeaderRow(trackingSheet);

    // ─── Sheet 5: Criterios Antifraude ───
    const criteriaSheet = workbook.addWorksheet("Criterios Antifraude", {
      properties: { tabColor: "C00000" },
    });

    criteriaSheet.columns = [
      { header: "Criterio", key: "criterio", width: 60 },
      { header: "Estado", key: "estado", width: 20 },
      { header: "Observaciones", key: "observaciones", width: 50 },
    ];

    const criterios = [
      "Listado de viajeros (conductor y pasajeros) con identificación (DNI/NIE, nombre, teléfono) y matrícula",
      "Identificación asociada de cada viaje: geolocalización de ubicación y tiempos de inicio, trazado y fin",
      "Confirmación activa por parte de cada viajero del inicio y fin del trayecto",
      "Verificación de que el trayecto se realiza en coche y no en otro medio de transporte",
      "Verificación de que el trayecto se realiza en un único vehículo con todos los viajeros",
      "Asociación de un DNI/NIE a cada cuenta de usuario",
      "Los viajes no pueden registrarse de nuevo en esta ni en otra plataforma similar",
    ];

    for (const c of criterios) {
      criteriaSheet.addRow({ criterio: c, estado: "", observaciones: "" });
    }

    styleHeaderRow(criteriaSheet);

    const fileName = `cae_report_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("[cae-reports] generateCAEReport error:", error);
    return res.status(500).send({
      status: "Error",
      message: error?.message ?? String(error),
    });
  }
}

function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "1F4E79" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export const methods = {
  generateCAEReport,
};
