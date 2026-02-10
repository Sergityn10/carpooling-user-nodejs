import dotenv from "dotenv";
import database from "../database.js";
import { DisponibilidadSemanaSchemas } from "../schemas/disponibilidad_semana.js";

dotenv.config();

async function createDisponibilidad(req, res) {
  const data =
    await DisponibilidadSemanaSchemas.validateDisponibilidadSemanaSinId(
      req.body,
    );
  if (!data.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(data.error.message) });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }
  const disponibilidad = {
    ...data.data,
    user_id: user.id,
  };

  try {
    const result = await database.execute({
      sql: "INSERT INTO disponibilidad_semanal (user_id, dia_semana, hora_inicio, hora_fin, transport_needed, transporte, estado, finalidad, origen, destino) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        disponibilidad.user_id,
        disponibilidad.dia_semana,
        disponibilidad.hora_inicio,
        disponibilidad.hora_fin,
        disponibilidad.transport_needed ? 1 : 0,
        disponibilidad.transporte ?? null,
        disponibilidad.estado,
        disponibilidad.finalidad,
        disponibilidad.origen,
        disponibilidad.destino,
      ],
    });

    if (!result || result.rowsAffected === 0) {
      return res.status(500).send({
        status: "Error",
        message: "No se pudo crear la disponibilidad",
      });
    }

    const insertedId =
      result?.lastInsertRowid !== undefined && result?.lastInsertRowid !== null
        ? Number(result.lastInsertRowid)
        : null;

    return res.status(200).send({
      status: "Success",
      message: "Disponibilidad creada correctamente",
      disponibilidad: {
        ...disponibilidad,
        id: insertedId,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Error al crear disponibilidad" });
  }
}

async function updateDisponibilidad(req, res) {
  const parsed =
    DisponibilidadSemanaSchemas.validateDisponibilidadSemanaPartial(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .send({ status: "Error", message: parsed.error.message });
  }
  const value = { ...parsed.data };
  if ("disponibilidad_semana_id" in value)
    delete value.disponibilidad_semana_id;
  if ("user_id" in value) delete value.user_id;

  const { id } = req.params;
  try {
    const ownerRes = await database.execute({
      sql: "SELECT user_id FROM disponibilidad_semanal WHERE id = ?",
      args: [id],
    });
    const ownerId = ownerRes.rows?.[0]?.user_id;
    if (ownerId === undefined || ownerId === null) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    if (String(ownerId) !== String(req.user?.id)) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para modificar esta disponibilidad",
      });
    }

    const keys = Object.keys(value);
    if (keys.length === 0) {
      return res
        .status(400)
        .send({ status: "Error", message: "No fields to update" });
    }

    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const args = keys.map((k) => {
      if (k === "transport_needed") return value[k] ? 1 : 0;
      return value[k];
    });
    args.push(id);

    const result = await database.execute({
      sql: `UPDATE disponibilidad_semanal SET ${setClause} WHERE id = ?`,
      args,
    });

    if (!result || result.rowsAffected === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidad actualizada correctamente",
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Error al actualizar disponibilidad" });
  }
}

async function removeDisponibilidad(req, res) {
  const { id } = req.params;
  try {
    const rutine = await database.execute({
      sql: "SELECT user_id FROM disponibilidad_semanal WHERE id = ?",
      args: [id],
    });
    const ownerId = rutine.rows?.[0]?.user_id;
    if (ownerId === undefined || ownerId === null) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    if (String(ownerId) !== String(req.user?.id)) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para eliminar esta disponibilidad",
      });
    }
    const result = await database.execute({
      sql: "DELETE FROM disponibilidad_semanal WHERE id = ?",
      args: [id],
    });

    if (!result || result.rowsAffected === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    return res
      .status(200)
      .send({ status: "Success", message: "Disponibilidad eliminada" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Error al eliminar disponibilidad" });
  }
}

async function getDisponibilidad(req, res) {
  const { id } = req.params;
  try {
    const result = await database.execute({
      sql: "SELECT * FROM disponibilidad_semanal WHERE id = ?",
      args: [id],
    });
    const rows = result.rows ?? [];
    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    if (String(rows[0].user_id) !== String(req.user?.id)) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para acceder a esta disponibilidad",
      });
    }
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidad encontrada",
      disponibilidad: rows[0],
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Error al obtener disponibilidad" });
  }
}

async function getDisponibilidadesByUserId(req, res) {
  const { userId } = req.params;
  try {
    const userRows = await database.execute({
      sql: "SELECT 1 FROM users WHERE id = ?",
      args: [userId],
    });
    if ((userRows.rows ?? []).length === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Usuario no encontrado" });
    }

    const rowsRes = await database.execute({
      sql: `SELECT * FROM disponibilidad_semanal
            WHERE user_id = ?
            ORDER BY CASE dia_semana
              WHEN 'Lunes' THEN 1
              WHEN 'Martes' THEN 2
              WHEN 'Miercoles' THEN 3
              WHEN 'Jueves' THEN 4
              WHEN 'Viernes' THEN 5
              WHEN 'Sabado' THEN 6
              WHEN 'Domingo' THEN 7
              ELSE 99
            END, hora_inicio`,
      args: [userId],
    });
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidades encontradas",
      disponibilidades: rowsRes.rows ?? [],
    });
  } catch (error) {
    return res.status(500).send({
      status: "Error",
      message: "Error al obtener disponibilidades del usuario",
    });
  }
}

async function getDisponibilidadesByUserIdAndFinalidad(req, res) {
  const { userId, finalidad } = req.params;
  try {
    const rowsRes = await database.execute({
      sql: `SELECT * FROM disponibilidad_semanal
            WHERE user_id = ? AND finalidad = ?
            ORDER BY CASE dia_semana
              WHEN 'Lunes' THEN 1
              WHEN 'Martes' THEN 2
              WHEN 'Miercoles' THEN 3
              WHEN 'Jueves' THEN 4
              WHEN 'Viernes' THEN 5
              WHEN 'Sabado' THEN 6
              WHEN 'Domingo' THEN 7
              ELSE 99
            END, hora_inicio`,
      args: [userId, finalidad],
    });
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidades por finalidad encontradas",
      disponibilidades: rowsRes.rows ?? [],
    });
  } catch (error) {
    return res.status(500).send({
      status: "Error",
      message: "Error al obtener disponibilidades por finalidad",
    });
  }
}

export const methods = {
  createDisponibilidad,
  updateDisponibilidad,
  removeDisponibilidad,
  getDisponibilidad,
  getDisponibilidadesByUserId,
  getDisponibilidadesByUserIdAndFinalidad,
};
