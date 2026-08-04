import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { ServiceEventSchemas } from "../schemas/service_event.js";
import { GoogleMapsProvider } from "../providers/google-maps.js";
import parseUTCDate from "../utils/parseUTCDate.js";

dotenv.config();

async function create(req, res) {
  const enterprise = req.enterprise;
  const parsed = ServiceEventSchemas.validateServiceEventCreate(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const ev = parsed.data;

  const title = ev.name;
  const description = ev.description ?? null;
  const start_at = parseUTCDate(ev.startDate);
  const end_at = ev.endDate ? parseUTCDate(ev.endDate) : null;
  const address_line1 = ev.location;
  const city = "";

  const email = enterprise?.email;
  if (!email) {
    return res
      .status(403)
      .send({ status: "Error", message: "Access denied. Enterprises only." });
  }

  const enterpriseRecord = await prisma.enterprise.findUnique({
    where: { email },
    select: { id: true },
  });
  const enterpriseId = enterpriseRecord?.id;

  if (!Number.isFinite(enterpriseId)) {
    return res.status(400).send({
      status: "Error",
      message: "Empresa no encontrada en BD (enterprise_id inválido).",
    });
  }

  let latitude = ev.latitude ?? null;
  let longitude = ev.longitude ?? null;

  if (latitude == null || longitude == null) {
    try {
      const coords = await GoogleMapsProvider.geocodeAddress(ev.location);
      latitude = coords.lat;
      longitude = coords.lng;
    } catch (error) {
      return res.status(400).send({
        status: "Error",
        message: `No se pudo geocodificar la dirección del evento: ${error.message}`,
      });
    }
  }

  try {
    const created = await prisma.serviceEvent.create({
      data: {
        enterprise_id: enterpriseId,
        title,
        description,
        start_at,
        end_at,
        status: "requested",
        venue_name: null,
        address_line1,
        address_line2: null,
        city,
        province: null,
        postal_code: null,
        country: "ES",
        latitude,
        longitude,
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        attendees_estimate: null,
        notes: null,
        image: ev.image ?? null,
      },
    });

    return res.status(201).send({
      status: "Success",
      message: "Service event created",
      service_event: created,
    });
  } catch (error) {
    console.error("Error creating service event", {
      enterpriseId,
      email,
      error,
    });
    const msg = error?.message ?? String(error);
    if (
      msg.toLowerCase().includes("foreign key") ||
      msg.toLowerCase().includes("constraint")
    ) {
      return res.status(400).send({
        status: "Error",
        message:
          "Empresa no válida para crear el evento (enterprise_id no existe o relación inválida).",
      });
    }
    return res.status(500).send({
      status: "Error",
      message: `Failed to create service event: ${msg}`,
    });
  }
}

async function list(req, res) {
  const enterprise = req.enterprise;

  const limitRaw = req.query?.limit;
  const offsetRaw = req.query?.offset;
  const limit = Number.isFinite(Number(limitRaw))
    ? Math.min(200, Math.max(1, Number(limitRaw)))
    : 50;
  const offset = Number.isFinite(Number(offsetRaw))
    ? Math.max(0, Number(offsetRaw))
    : 0;

  try {
    const rows = await prisma.serviceEvent.findMany({
      where: { enterprise_id: enterprise.id },
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    });

    return res
      .status(200)
      .send({ status: "Success", service_events: rows, limit, offset });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to fetch service events" });
  }
}

async function getById(req, res) {
  const enterprise = req.enterprise;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).send({ status: "Error", message: "Invalid id" });
  }

  try {
    const row = await prisma.serviceEvent.findFirst({
      where: { id, enterprise_id: enterprise.id },
    });

    if (!row) {
      return res
        .status(404)
        .send({ status: "Error", message: "Service event not found" });
    }

    return res.status(200).send({ status: "Success", service_event: row });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to fetch service event" });
  }
}

async function patch(req, res) {
  const enterprise = req.enterprise;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).send({ status: "Error", message: "Invalid id" });
  }

  const allowedSchema = ServiceEventSchemas.validateServiceEventPartial(
    req.body,
  );
  if (!allowedSchema.success) {
    return res.status(400).send({
      status: "Error",
      message: JSON.parse(allowedSchema.error.message),
    });
  }

  const updates = { ...allowedSchema.data };
  delete updates.id;
  delete updates.enterprise_id;

  if (updates.start_at !== undefined)
    updates.start_at = parseUTCDate(updates.start_at);
  if (updates.end_at !== undefined)
    updates.end_at = parseUTCDate(updates.end_at);

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
  }

  try {
    const updated = await prisma.serviceEvent.updateMany({
      where: { id, enterprise_id: enterprise.id },
      data: updates,
    });

    if (updated.count === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Service event not found" });
    }

    const refreshed = await prisma.serviceEvent.findFirst({
      where: { id, enterprise_id: enterprise.id },
    });

    return res.status(200).send({
      status: "Success",
      message: "Service event updated",
      service_event: refreshed,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to update service event" });
  }
}

async function remove(req, res) {
  const enterprise = req.enterprise;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).send({ status: "Error", message: "Invalid id" });
  }

  try {
    const deleted = await prisma.serviceEvent.deleteMany({
      where: { id, enterprise_id: enterprise.id },
    });

    if (deleted.count === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Service event not found" });
    }

    return res
      .status(200)
      .send({ status: "Success", message: "Service event removed" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to remove service event" });
  }
}

export const methods = {
  create,
  list,
  getById,
  patch,
  remove,
};
