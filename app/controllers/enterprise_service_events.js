import dotenv from "dotenv";
import database from "../database.js";
import { ServiceEventSchemas } from "../schemas/service_event.js";
import { GoogleMapsProvider } from "../providers/google-maps.js";

dotenv.config();

async function create(req, res) {
    const enterprise = req.enterprise;
    console.log("Empresa",enterprise)
    console.log("Despues de la empresa")
    const parsed = ServiceEventSchemas.validateServiceEventCreate(req.body);
    if (!parsed.success) {
        return res.status(400).send({ status: "Error", message: JSON.parse(parsed.error.message) });
    }

    const ev = parsed.data;

    const title = ev.name;
    const description = ev.description ?? null;
    const start_at = ev.startDate;
    const end_at = ev.endDate ?? null;
    const address_line1 = ev.location;
    const city = "";

    const email = enterprise?.email;
    if (!email) {
        return res.status(403).send({ status: "Error", message: "Access denied. Enterprises only." });
    }

    const enterpriseRow = await database.execute({
        sql: "SELECT id FROM enterprises WHERE email = ? LIMIT 1",
        args: [email],
    });
    const rawEnterpriseId = enterpriseRow.rows?.[0]?.id;
    const enterpriseId = Math.trunc(Number(rawEnterpriseId));

    if (!Number.isFinite(enterpriseId)) {
        return res.status(400).send({ status: "Error", message: "Empresa no encontrada en BD (enterprise_id inválido)." });
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

    let insertRes;
    try {
        insertRes = await database.execute({
            sql: `INSERT INTO service_events (
                    enterprise_id,
                    title,
                    description,
                    start_at,
                    end_at,
                    status,
                    venue_name,
                    address_line1,
                    address_line2,
                    city,
                    province,
                    postal_code,
                    country,
                    latitude,
                    longitude,
                    contact_name,
                    contact_email,
                    contact_phone,
                    attendees_estimate,
                    notes
                  ) VALUES (CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                enterpriseId,
                title,
                description,
                start_at,
                end_at,
                "requested",
                null,
                address_line1,
                null,
                city,
                null,
                null,
                "ES",
                latitude,
                longitude,
                null,
                null,
                null,
                null,
                null,
            ],
        });
    } catch (error) {
        console.error("Error creating service event", {
            enterpriseId,
            email,
            error,
        });
        const msg = error?.message ?? String(error);
        if (msg.toLowerCase().includes("foreign key") || msg.toLowerCase().includes("constraint")) {
            return res.status(400).send({ status: "Error", message: "Empresa no válida para crear el evento (enterprise_id no existe o relación inválida)." });
        }
        return res.status(500).send({ status: "Error", message: `Failed to create service event: ${msg}` });
    }

    if (!insertRes || insertRes.rowsAffected === 0) {
        return res.status(500).send({ status: "Error", message: "Failed to create service event" });
    }

    const rowId = insertRes.lastInsertRowid ?? null;
    let created = null;
    if (rowId != null) {
        try {
            const q = await database.execute({
                sql: "SELECT * FROM service_events WHERE id = ? AND enterprise_id = ?",
                args: [Number(rowId), enterprise.id],
            });
            created = q.rows?.[0] ?? null;
        } catch (_) {
            const q = await database.execute({
                sql: "SELECT * FROM service_events WHERE id = ? AND username = ?",
                args: [Number(rowId), enterprise.email],
            });
            created = q.rows?.[0] ?? null;
        }
    }

    return res.status(201).send({ status: "Success", message: "Service event created", service_event: created });
}

async function list(req, res) {
    const enterprise = req.enterprise;

    const limitRaw = req.query?.limit;
    const offsetRaw = req.query?.offset;
    const limit = Number.isFinite(Number(limitRaw)) ? Math.min(200, Math.max(1, Number(limitRaw))) : 50;
    const offset = Number.isFinite(Number(offsetRaw)) ? Math.max(0, Number(offsetRaw)) : 0;

    let rows;
    try {
        const q = await database.execute({
            sql: `SELECT *
                  FROM service_events
                  WHERE enterprise_id = ?
                  ORDER BY datetime(created_at) DESC
                  LIMIT ? OFFSET ?`,
            args: [enterprise.id, limit, offset],
        });
        rows = q.rows;
    } catch (_) {
        const q = await database.execute({
            sql: `SELECT *
                  FROM service_events
                  WHERE username = ?
                  ORDER BY datetime(created_at) DESC
                  LIMIT ? OFFSET ?`,
            args: [enterprise.email, limit, offset],
        });
        rows = q.rows;
    }

    return res.status(201).send({ status: "Success", service_events: rows, limit, offset });
}

async function getById(req, res) {
    const enterprise = req.enterprise;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        return res.status(400).send({ status: "Error", message: "Invalid id" });
    }

    let rows;
    try {
        const q = await database.execute({
            sql: "SELECT * FROM service_events WHERE id = ? AND enterprise_id = ? LIMIT 1",
            args: [id, enterprise.id],
        });
        rows = q.rows;
    } catch (_) {
        const q = await database.execute({
            sql: "SELECT * FROM service_events WHERE id = ? AND username = ? LIMIT 1",
            args: [id, enterprise.email],
        });
        rows = q.rows;
    }

    if (rows.length === 0) {
        return res.status(404).send({ status: "Error", message: "Service event not found" });
    }

    return res.status(200).send({ status: "Success", service_event: rows[0] });
}

async function patch(req, res) {
    const enterprise = req.enterprise;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        return res.status(400).send({ status: "Error", message: "Invalid id" });
    }

    const allowedSchema = ServiceEventSchemas.validateServiceEventPartial(req.body);
    if (!allowedSchema.success) {
        return res.status(400).send({ status: "Error", message: JSON.parse(allowedSchema.error.message) });
    }

    const updates = { ...allowedSchema.data };
    delete updates.id;
    delete updates.enterprise_id;

    const keys = Object.keys(updates);
    if (keys.length === 0) {
        return res.status(400).send({ status: "Error", message: "No fields to update" });
    }

    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const args = [...keys.map((k) => updates[k]), id, enterprise.id];

    let updateRes;
    try {
        updateRes = await database.execute({
            sql: `UPDATE service_events
                  SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND enterprise_id = ?`,
            args,
        });
    } catch (_) {
        const argsLegacy = [...keys.map((k) => updates[k]), id, enterprise.email];
        updateRes = await database.execute({
            sql: `UPDATE service_events
                  SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND username = ?`,
            args: argsLegacy,
        });
    }

    if (!updateRes || updateRes.rowsAffected === 0) {
        return res.status(404).send({ status: "Error", message: "Service event not found" });
    }

    let refreshed;
    try {
        refreshed = await database.execute({
            sql: "SELECT * FROM service_events WHERE id = ? AND enterprise_id = ?",
            args: [id, enterprise.id],
        });
    } catch (_) {
        refreshed = await database.execute({
            sql: "SELECT * FROM service_events WHERE id = ? AND username = ?",
            args: [id, enterprise.email],
        });
    }

    return res.status(200).send({ status: "Success", message: "Service event updated", service_event: refreshed.rows?.[0] ?? null });
}

async function remove(req, res) {
    const enterprise = req.enterprise;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        return res.status(400).send({ status: "Error", message: "Invalid id" });
    }

    let delRes;
    try {
        delRes = await database.execute({
            sql: "DELETE FROM service_events WHERE id = ? AND enterprise_id = ?",
            args: [id, enterprise.id],
        });
    } catch (_) {
        delRes = await database.execute({
            sql: "DELETE FROM service_events WHERE id = ? AND username = ?",
            args: [id, enterprise.email],
        });
    }

    if (!delRes || delRes.rowsAffected === 0) {
        return res.status(404).send({ status: "Error", message: "Service event not found" });
    }

    return res.status(200).send({ status: "Success", message: "Service event removed" });
}

export const methods = {
    create,
    list,
    getById,
    patch,
    remove,
};
