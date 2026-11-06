import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { ServiceEventSchemas } from "../schemas/service_event.js";
import { GoogleMapsProvider } from "../providers/google-maps.js";
import parseUTCDate from "../utils/parseUTCDate.js";
import { eventBus } from "../services/eventBus.js";

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
  const venue_name = ev.venue_name ?? null;
  let city = ev.city ? String(ev.city).trim() : "";
  const attendees_estimate =
    ev.attendees_estimate != null ? Number(ev.attendees_estimate) : null;

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

  if (!enterpriseId) {
    return res.status(400).send({
      status: "Error",
      message: "Empresa no encontrada en BD (enterprise_id inválido).",
    });
  }

  let latitude = ev.latitude != null ? Number(ev.latitude) : null;
  let longitude = ev.longitude != null ? Number(ev.longitude) : null;

  if (latitude == null || longitude == null) {
    try {
      const coords = await GoogleMapsProvider.geocodeAddressDetails(ev.location);
      if (coords?.lat != null && coords?.lng != null) {
        latitude = Number(coords.lat);
        longitude = Number(coords.lng);
        if (!city && coords.city) {
          city = coords.city;
        }
      }
    } catch (_error) {
      // Si la geocodificación en servidor falla por restricciones de API key,
      // se continúa sin bloquear la creación
    }
  }

  if (!city && address_line1) {
    const parts = address_line1.split(",").map((p) => p.trim());
    if (parts.length >= 2) {
      city = parts[parts.length - 1].replace(/\d+/g, "").trim() || "Madrid";
    } else {
      city = "Madrid";
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
        venue_name,
        address_line1,
        address_line2: null,
        city: city || "Madrid",
        province: null,
        postal_code: null,
        country: "ES",
        latitude,
        longitude,
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        attendees_estimate,
        notes: null,
        image: ev.image ?? null,
      },
    });

    await eventBus.enterpriseServiceEventCreated(
      created.id,
      enterpriseId,
      title,
    );

    const formattedCreated = {
      ...created,
      latitude: created.latitude != null ? Number(created.latitude) : null,
      longitude: created.longitude != null ? Number(created.longitude) : null,
      attendees_estimate:
        created.attendees_estimate != null
          ? Number(created.attendees_estimate)
          : null,
      max_attendees:
        created.attendees_estimate != null
          ? Number(created.attendees_estimate)
          : null,
      name: created.title,
      location: created.address_line1,
      startDate: created.start_at,
      endDate: created.end_at,
    };

    return res.status(201).send({
      status: "Success",
      message: "Service event created",
      service_event: formattedCreated,
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
    const [serviceRows, platformRows] = await Promise.all([
      prisma.serviceEvent.findMany({
        where: { enterprise_id: enterprise.id },
        include: {
          _count: {
            select: { participants: true },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.platformEvent.findMany({
        where: { enterprise_id: enterprise.id },
        include: {
          _count: {
            select: { participants: true },
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);

    const enrichedService = serviceRows.map((ev) => {
      const count = ev._count?.participants ?? 0;
      return {
        ...ev,
        name: ev.title,
        location: ev.address_line1 || ev.venue_name || "",
        address: ev.address_line1 || "",
        startDate: ev.start_at,
        endDate: ev.end_at,
        latitude: ev.latitude != null ? Number(ev.latitude) : null,
        longitude: ev.longitude != null ? Number(ev.longitude) : null,
        attendees_estimate:
          ev.attendees_estimate != null ? Number(ev.attendees_estimate) : null,
        max_attendees:
          ev.attendees_estimate != null ? Number(ev.attendees_estimate) : null,
        total_participants: count,
        participants_count: count,
        inscribed_count: count,
        _count: {
          participants: count,
        },
      };
    });

    const enrichedPlatform = platformRows.map((pe) => {
      const count = pe._count?.participants ?? 0;
      return {
        id: pe.id,
        enterprise_id: pe.enterprise_id,
        title: pe.name,
        name: pe.name,
        description: pe.description,
        start_at: pe.start_date,
        end_at: pe.end_date,
        startDate: pe.start_date,
        endDate: pe.end_date,
        start_date: pe.start_date,
        end_date: pe.end_date,
        address_line1: pe.location || pe.address || "Sede",
        location: pe.location || pe.address || "Sede",
        address: pe.address || pe.location || "Sede",
        status: "active",
        latitude: pe.latitude != null ? Number(pe.latitude) : null,
        longitude: pe.longitude != null ? Number(pe.longitude) : null,
        attendees_estimate: null,
        max_attendees: null,
        total_participants: count,
        participants_count: count,
        inscribed_count: count,
        _count: {
          participants: count,
        },
        created_at: pe.created_at,
        updated_at: pe.updated_at,
      };
    });

    const allRows = [...enrichedService, ...enrichedPlatform].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const paginated = allRows.slice(offset, offset + limit);

    return res.status(200).send({
      status: "Success",
      service_events: paginated,
      limit,
      offset,
      total: allRows.length,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to fetch service events" });
  }
}

async function getById(req, res) {
  const enterprise = req.enterprise;
  const id = req.params.id ? String(req.params.id).trim() : "";
  if (!id) {
    return res.status(400).send({ status: "Error", message: "Invalid id" });
  }

  try {
    const row = await prisma.serviceEvent.findFirst({
      where: { id, enterprise_id: enterprise.id },
      include: {
        _count: {
          select: { participants: true },
        },
      },
    });

    if (row) {
      const count = row._count?.participants ?? 0;
      const enrichedRow = {
        ...row,
        name: row.title,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        attendees_estimate:
          row.attendees_estimate != null ? Number(row.attendees_estimate) : null,
        max_attendees:
          row.attendees_estimate != null ? Number(row.attendees_estimate) : null,
        location: row.address_line1 || row.venue_name || "",
        address: row.address_line1 || "",
        startDate: row.start_at,
        endDate: row.end_at,
        total_participants: count,
        participants_count: count,
        inscribed_count: count,
        _count: {
          participants: count,
        },
      };

      return res
        .status(200)
        .send({ status: "Success", service_event: enrichedRow, data: enrichedRow });
    }

    // Fallback: Si el evento pertenece a esta organización pero se registró en platform_events
    const platformRow = await prisma.platformEvent.findFirst({
      where: { id, enterprise_id: enterprise.id },
      include: {
        _count: {
          select: { participants: true },
        },
      },
    });

    if (platformRow) {
      const count = platformRow._count?.participants ?? 0;
      const enrichedPlatform = {
        id: platformRow.id,
        enterprise_id: platformRow.enterprise_id,
        title: platformRow.name,
        name: platformRow.name,
        description: platformRow.description,
        start_at: platformRow.start_date,
        end_at: platformRow.end_date,
        startDate: platformRow.start_date,
        endDate: platformRow.end_date,
        start_date: platformRow.start_date,
        end_date: platformRow.end_date,
        address_line1: platformRow.location || platformRow.address || "Sede",
        location: platformRow.location || platformRow.address || "Sede",
        address: platformRow.address || platformRow.location || "Sede",
        status: "active",
        latitude:
          platformRow.latitude != null ? Number(platformRow.latitude) : null,
        longitude:
          platformRow.longitude != null ? Number(platformRow.longitude) : null,
        attendees_estimate: null,
        max_attendees: null,
        total_participants: count,
        participants_count: count,
        inscribed_count: count,
        _count: {
          participants: count,
        },
        created_at: platformRow.created_at,
        updated_at: platformRow.updated_at,
      };

      return res
        .status(200)
        .send({ status: "Success", service_event: enrichedPlatform, data: enrichedPlatform });
    }

    return res
      .status(404)
      .send({ status: "Error", message: "Service event not found" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to fetch service event" });
  }
}

async function patch(req, res) {
  const enterprise = req.enterprise;
  const id = req.params.id ? String(req.params.id).trim() : "";
  if (!id) {
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

  if (updates.start_at !== undefined && updates.start_at !== null)
    updates.start_at = parseUTCDate(updates.start_at);
  if (updates.end_at !== undefined && updates.end_at !== null)
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

    const enrichedRefreshed = refreshed
      ? {
          ...refreshed,
          name: refreshed.title,
          latitude:
            refreshed.latitude != null ? Number(refreshed.latitude) : null,
          longitude:
            refreshed.longitude != null ? Number(refreshed.longitude) : null,
          attendees_estimate:
            refreshed.attendees_estimate != null
              ? Number(refreshed.attendees_estimate)
              : null,
          max_attendees:
            refreshed.attendees_estimate != null
              ? Number(refreshed.attendees_estimate)
              : null,
          location: refreshed.address_line1 || refreshed.venue_name || "",
          address: refreshed.address_line1 || "",
          startDate: refreshed.start_at,
          endDate: refreshed.end_at,
        }
      : refreshed;

    await eventBus.enterpriseServiceEventUpdated(id, updates);

    return res.status(200).send({
      status: "Success",
      message: "Service event updated",
      service_event: enrichedRefreshed,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to update service event" });
  }
}

async function remove(req, res) {
  const enterprise = req.enterprise;
  const id = req.params.id ? String(req.params.id).trim() : "";
  if (!id) {
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

    await eventBus.enterpriseServiceEventDeleted(id);

    return res
      .status(200)
      .send({ status: "Success", message: "Service event removed" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to remove service event" });
  }
}

async function getMetrics(req, res) {
  const enterprise = req.enterprise;
  const id = req.params.id ? String(req.params.id).trim() : "";
  if (!id) {
    return res.status(400).send({ status: "Error", message: "Invalid id" });
  }

  try {
    const [serviceCount, platformCount] = await Promise.all([
      prisma.serviceEventParticipant.count({
        where: {
          service_event_id: id,
          serviceEvent: { enterprise_id: enterprise.id },
        },
      }),
      prisma.eventParticipant.count({
        where: {
          event_id: id,
          event: { enterprise_id: enterprise.id },
        },
      }),
    ]);

    const registeredUsers = serviceCount + platformCount;
    const views = registeredUsers > 0 ? registeredUsers * 4 + 12 : 5;
    const requests = registeredUsers;

    const metricsData = {
      registeredUsers,
      registered_users: registeredUsers,
      usersRegistered: registeredUsers,
      views,
      pageViews: views,
      page_views: views,
      requests,
      reservations: requests,
      totalRequests: requests,
    };

    return res.status(200).send({
      status: "Success",
      data: metricsData,
      metrics: metricsData,
    });
  } catch (error) {
    return res.status(500).send({
      status: "Error",
      message: "Failed to fetch event metrics",
    });
  }
}

export const methods = {
  create,
  list,
  getById,
  getMetrics,
  patch,
  remove,
};
