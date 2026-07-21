import ExcelJS from "exceljs";
import prisma from "../lib/prisma.js";
import { trayectosService } from "../services/trayectosService.js";
import { methods as cryptoUtils } from "../utils/crypto.js";

function getAdminToken(req) {
  return req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;
}

async function getReportsSummary(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }
    const data = await trayectosService.getCAEReportsSummary(adminToken);
    if (!data) {
      return res.status(502).send({
        status: "Error",
        message: "Error fetching summary from trayectos service",
      });
    }
    return res.status(200).send(data);
  } catch (error) {
    console.error("[cae-reports] getReportsSummary error:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function listReports(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }
    const { status, page, limit } = req.query;
    const data = await trayectosService.getCAEReports(
      adminToken,
      status,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
    if (!data) {
      return res.status(502).send({
        status: "Error",
        message: "Error fetching reports from trayectos service",
      });
    }
    return res.status(200).send(data);
  } catch (error) {
    console.error("[cae-reports] listReports error:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function createReport(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }
    const { name } = req.body || {};
    const data = await trayectosService.createCAEReport(adminToken, name);
    if (!data) {
      return res.status(502).send({
        status: "Error",
        message: "Error creating report in trayectos service",
      });
    }
    return res.status(201).send(data);
  } catch (error) {
    console.error("[cae-reports] createReport error:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getReportById(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }
    const { id } = req.params;
    const reportData = await trayectosService.getCAEReportById(id, adminToken);
    if (!reportData) {
      return res.status(502).send({
        status: "Error",
        message: "Error fetching report from trayectos service",
      });
    }

    const items = reportData.items ?? [];
    const userIds = new Set();
    for (const item of items) {
      if (item.conductor?.user_id) userIds.add(item.conductor.user_id);
      for (const p of item.pasajeros ?? []) {
        if (p.user_id) userIds.add(p.user_id);
      }
    }

    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, phone: true, dni: true },
    });

    const userMap = new Map();
    for (const u of users) {
      const decrypted = cryptoUtils.decryptFields(u, ["name", "phone", "dni"]);
      userMap.set(u.id, decrypted);
    }

    const enrichedItems = items.map((item) => ({
      ...item,
      conductor: {
        ...item.conductor,
        dni: userMap.get(item.conductor?.user_id)?.dni ?? "N/D",
        phone: userMap.get(item.conductor?.user_id)?.phone ?? "N/D",
      },
      pasajeros: (item.pasajeros ?? []).map((p) => ({
        ...p,
        dni: userMap.get(p.user_id)?.dni ?? "N/D",
        phone: userMap.get(p.user_id)?.phone ?? "N/D",
      })),
    }));

    return res.status(200).send({
      status: "Success",
      reporte: reportData.reporte,
      items: enrichedItems,
    });
  } catch (error) {
    console.error("[cae-reports] getReportById error:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function exportReportExcel(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }

    const { id } = req.params;
    console.log("[cae-reports] exportReportExcel - reportId:", id);
    const reportData = await trayectosService.getCAEReportById(id, adminToken);
    console.log(
      "[cae-reports] reportData from trayectos:",
      JSON.stringify(reportData, null, 2),
    );
    if (!reportData) {
      console.log("[cae-reports] reportData is null/undefined");
      return res.status(502).send({
        status: "Error",
        message: "Error fetching report from trayectos service",
      });
    }

    const items = reportData.items ?? [];
    console.log("[cae-reports] items count:", items.length);
    if (items.length > 0) {
      console.log("[cae-reports] first item keys:", Object.keys(items[0]));
      console.log(
        "[cae-reports] first item sample:",
        JSON.stringify(items[0], null, 2),
      );
    }
    if (items.length === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "No CAEs found in this report" });
    }

    const userIds = new Set();
    for (const item of items) {
      if (item.conductor?.user_id) userIds.add(item.conductor.user_id);
      for (const p of item.pasajeros ?? []) {
        if (p.user_id) userIds.add(p.user_id);
      }
    }

    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, phone: true, dni: true },
    });
    console.log("[cae-reports] userIds to fetch:", [...userIds]);
    console.log("[cae-reports] users found in DB:", users.length);

    const userMap = new Map();
    for (const u of users) {
      const decrypted = cryptoUtils.decryptFields(u, ["name", "phone", "dni"]);
      userMap.set(u.id, decrypted);
    }
    console.log(
      "[cae-reports] userMap entries:",
      [...userMap.entries()].map(([k, v]) => ({
        id: k,
        name: v?.name,
        dni: v?.dni,
        phone: v?.phone,
      })),
    );

    const reporte = reportData.reporte;
    console.log("[cae-reports] reporte:", JSON.stringify(reporte, null, 2));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "YouConnext Admin";
    workbook.created = new Date();

    // ─── Sheet 1: Resumen ───
    const summarySheet = workbook.addWorksheet("Resumen", {
      properties: { tabColor: "1F4E79" },
    });

    summarySheet.columns = [
      { header: "Métrica", key: "metric", width: 40 },
      { header: "Valor", key: "value", width: 25 },
    ];

    summarySheet.addRow({
      metric: "Nombre del reporte",
      value: reporte?.name ?? "",
    });
    summarySheet.addRow({
      metric: "Estado del reporte",
      value: reporte?.status ?? "",
    });
    summarySheet.addRow({
      metric: "Total CAEs",
      value: reporte?.total_caes ?? items.length,
    });
    summarySheet.addRow({
      metric: "Total kWh",
      value: reporte?.total_kwh ?? "",
    });
    summarySheet.addRow({
      metric: "Total EUR",
      value: reporte?.total_eur ?? "",
    });
    summarySheet.addRow({
      metric: "Fecha creación",
      value: reporte?.created_at ?? "",
    });
    summarySheet.addRow({ metric: "", value: "" });
    summarySheet.addRow({ metric: "Detalle por CAE", value: "" });

    for (const item of items) {
      summarySheet.addRow({
        metric: `  ${item.viaje?.origen ?? ""} → ${item.viaje?.destino ?? ""}`,
        value: `${item.kwh_generated ?? 0} kWh / ${item.eur_generated ?? 0} EUR`,
      });
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
      { header: "Hora inicio", key: "hora", width: 22 },
      { header: "Estado CAE", key: "cae_status", width: 14 },
      { header: "Conductor ID", key: "conductor_id", width: 36 },
      { header: "Conductor Nombre", key: "conductor_name", width: 25 },
      { header: "Conductor DNI/NIE", key: "conductor_dni", width: 20 },
      { header: "Conductor Teléfono", key: "conductor_phone", width: 18 },
      { header: "Conductor Email", key: "conductor_email", width: 30 },
      { header: "Vehículo ID", key: "vehiculo_id", width: 36 },
      { header: "Matrícula", key: "matricula", width: 12 },
      { header: "Marca", key: "marca", width: 15 },
      { header: "Modelo", key: "modelo", width: 15 },
      { header: "KM Recorridos", key: "km_recorridos", width: 14 },
      { header: "KM con Pasajeros", key: "km_with_company", width: 16 },
      { header: "kWh Generados", key: "kwh_generated", width: 14 },
      { header: "EUR Generados", key: "eur_generated", width: 14 },
      { header: "Vehículo Único", key: "vehiculo_unico", width: 14 },
    ];

    for (const item of items) {
      const conductorInfo = userMap.get(item.conductor?.user_id);
      tripsSheet.addRow({
        cae_id: item.cae_id ?? "",
        trip_id: item.trayecto_id ?? "",
        origen: item.viaje?.origen ?? "",
        destino: item.viaje?.destino ?? "",
        hora: item.viaje?.hora_inicio ?? "",
        cae_status: item.estado ?? "",
        conductor_id: item.conductor?.user_id ?? "",
        conductor_name: conductorInfo?.name ?? item.conductor?.nombre ?? "N/D",
        conductor_dni: conductorInfo?.dni ?? "N/D",
        conductor_phone: conductorInfo?.phone ?? "N/D",
        conductor_email: item.conductor?.email ?? "",
        vehiculo_id: item.vehiculo?.id ?? "",
        matricula: item.vehiculo?.matricula ?? "N/D",
        marca: item.vehiculo?.marca ?? "",
        modelo: item.vehiculo?.modelo ?? "",
        km_recorridos: item.km_recorridos ?? "",
        km_with_company: item.km_with_company ?? "",
        kwh_generated: item.kwh_generated ?? "",
        eur_generated: item.eur_generated ?? "",
        vehiculo_unico: item.verificacion_unico_vehiculo ? "Sí" : "No",
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
      { header: "Email", key: "email", width: 30 },
      { header: "Rol", key: "rol", width: 12 },
      { header: "Matrícula", key: "matricula", width: 12 },
      { header: "Confirmación Inicio", key: "confirm_inicio", width: 22 },
      { header: "Confirmación Fin", key: "confirm_fin", width: 22 },
      { header: "Inicio Lat", key: "inicio_lat", width: 12 },
      { header: "Inicio Lng", key: "inicio_lng", width: 12 },
      { header: "Fin Lat", key: "fin_lat", width: 12 },
      { header: "Fin Lng", key: "fin_lng", width: 12 },
    ];

    for (const item of items) {
      const conductorInfo = userMap.get(item.conductor?.user_id);
      const matricula = item.vehiculo?.matricula ?? "N/D";

      passengersSheet.addRow({
        trip_id: item.trayecto_id ?? "",
        hora: item.viaje?.hora_inicio ?? "",
        origen: item.viaje?.origen ?? "",
        destino: item.viaje?.destino ?? "",
        user_id: item.conductor?.user_id ?? "",
        name: conductorInfo?.name ?? item.conductor?.nombre ?? "N/D",
        dni: conductorInfo?.dni ?? "N/D",
        phone: conductorInfo?.phone ?? "N/D",
        email: item.conductor?.email ?? "",
        rol: "Conductor",
        matricula,
        confirm_inicio: "",
        confirm_fin: "",
        inicio_lat: "",
        inicio_lng: "",
        fin_lat: "",
        fin_lng: "",
      });

      for (const p of item.pasajeros ?? []) {
        const pUserInfo = userMap.get(p.user_id);
        passengersSheet.addRow({
          trip_id: item.trayecto_id ?? "",
          hora: item.viaje?.hora_inicio ?? "",
          origen: item.viaje?.origen ?? "",
          destino: item.viaje?.destino ?? "",
          user_id: p.user_id ?? "",
          name: pUserInfo?.name ?? p.nombre ?? "N/D",
          dni: pUserInfo?.dni ?? "N/D",
          phone: pUserInfo?.phone ?? "N/D",
          email: p.email ?? "",
          rol: "Pasajero",
          matricula,
          confirm_inicio: p.confirmacion_inicio ?? "",
          confirm_fin: p.confirmacion_fin ?? "",
          inicio_lat: p.inicio_lat ?? "",
          inicio_lng: p.inicio_lng ?? "",
          fin_lat: p.fin_lat ?? "",
          fin_lng: p.fin_lng ?? "",
        });
      }
    }

    styleHeaderRow(passengersSheet);

    // ─── Sheet 4: Trazado (Geolocalización GPS) ───
    const trackingSheet = workbook.addWorksheet("Trazado", {
      properties: { tabColor: "FFC000" },
    });

    trackingSheet.columns = [
      { header: "ID Trayecto", key: "trip_id", width: 36 },
      { header: "Latitud", key: "lat", width: 14 },
      { header: "Longitud", key: "lng", width: 14 },
      { header: "Dirección", key: "address", width: 40 },
      { header: "Timestamp", key: "timestamp", width: 22 },
    ];

    let trazadoCount = 0;
    for (const item of items) {
      const trazado = item.viaje?.trazado ?? [];
      console.log(
        `[cae-reports] item ${item.cae_id} - trazado points: ${trazado.length}`,
      );
      for (const point of trazado) {
        trackingSheet.addRow({
          trip_id: item.trayecto_id ?? "",
          lat: point.lat ?? "",
          lng: point.lng ?? "",
          address: point.address ?? "",
          timestamp: point.timestamp ?? "",
        });
        trazadoCount++;
      }
    }
    console.log("[cae-reports] total trazado rows:", trazadoCount);

    styleHeaderRow(trackingSheet);

    // ─── Sheet 5: Eventos del Trayecto ───
    const eventosSheet = workbook.addWorksheet("Eventos", {
      properties: { tabColor: "ED7D31" },
    });

    eventosSheet.columns = [
      { header: "ID Trayecto", key: "trip_id", width: 36 },
      { header: "Tipo Evento", key: "tipo", width: 18 },
      { header: "Usuario ID", key: "user_id", width: 36 },
      { header: "ID Reserva", key: "id_reserva", width: 36 },
      { header: "Latitud", key: "lat", width: 14 },
      { header: "Longitud", key: "lng", width: 14 },
      { header: "Timestamp", key: "timestamp", width: 22 },
    ];

    let eventosCount = 0;
    for (const item of items) {
      const eventos = item.eventos_trayecto ?? [];
      console.log(
        `[cae-reports] item ${item.cae_id} - eventos_trayecto: ${eventos.length}`,
      );
      for (const evt of eventos) {
        eventosSheet.addRow({
          trip_id: item.trayecto_id ?? "",
          tipo: evt.tipo ?? "",
          user_id: evt.user_id ?? "",
          id_reserva: evt.id_reserva ?? "",
          lat: evt.lat ?? "",
          lng: evt.lng ?? "",
          timestamp: evt.timestamp ?? "",
        });
        eventosCount++;
      }
    }
    console.log("[cae-reports] total eventos rows:", eventosCount);

    styleHeaderRow(eventosSheet);

    // ─── Sheet 6: Criterios Antifraude ───
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

    const reportName = (reporte?.name ?? "cae_report").replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );
    const fileName = `${reportName}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    console.log(
      "[cae-reports] Excel buffer generated, size:",
      buffer?.length ?? buffer?.byteLength,
      "bytes",
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("[cae-reports] exportReportExcel error:", error);
    if (!res.headersSent) {
      return res.status(500).send({
        status: "Error",
        message: error?.message ?? String(error),
      });
    }
    res.end();
  }
}

async function updateReportStatus(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return res
        .status(400)
        .send({ status: "Error", message: "status field is required" });
    }
    const data = await trayectosService.updateCAEReportStatus(
      id,
      status,
      adminToken,
    );
    if (!data) {
      return res.status(502).send({
        status: "Error",
        message: "Error updating report status in trayectos service",
      });
    }
    return res.status(200).send(data);
  } catch (error) {
    console.error("[cae-reports] updateReportStatus error:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function deleteReport(req, res) {
  try {
    const adminToken = getAdminToken(req);
    if (!adminToken) {
      return res
        .status(401)
        .send({ status: "Error", message: "Admin token required" });
    }
    const { id } = req.params;
    const data = await trayectosService.deleteCAEReport(id, adminToken);
    if (!data) {
      return res.status(502).send({
        status: "Error",
        message: "Error deleting report in trayectos service",
      });
    }
    return res.status(200).send(data);
  } catch (error) {
    console.error("[cae-reports] deleteReport error:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
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
  getReportsSummary,
  listReports,
  createReport,
  getReportById,
  updateReportStatus,
  deleteReport,
  exportReportExcel,
};
