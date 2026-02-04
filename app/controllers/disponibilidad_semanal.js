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
  const disponibilidad = {
    ...data.data,
    username: user?.username ?? data.data.username,
  };

  let result;
  try {
    const connection = await database.getConnection();
    [result] = await connection.query(
      "INSERT INTO disponibilidad_semanal (username, dia_semana, hora_inicio, hora_fin, transport_needed, transporte, estado, finalidad, origen, destino) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        disponibilidad.username,
        disponibilidad.dia_semana,
        disponibilidad.hora_inicio,
        disponibilidad.hora_fin,
        disponibilidad.transport_needed,
        disponibilidad.transporte ? disponibilidad.transporte : "",
        disponibilidad.estado,
        disponibilidad.finalidad,
        disponibilidad.origen,
        disponibilidad.destino,
      ],
    );
  } catch (error) {
    switch (error.code) {
      case "ER_DUP_ENTRY":
        return res
          .status(400)
          .send({ status: "Error", message: "Disponibilidad duplicada" });
      default:
        return res
          .status(500)
          .send({
            status: "Error",
            message: `Error al crear disponibilidad: ${error.message}`,
          });
    }
  }
  if (result.affectedRows === 0) {
    return res
      .status(500)
      .send({ status: "Error", message: "No se pudo crear la disponibilidad" });
  }
  return res.status(200).send({
    status: "Success",
    message: "Disponibilidad creada correctamente",
    disponibilidad: {
      ...disponibilidad,
      disponibilidad_semana_id: result.insertId,
    },
  });
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

  const { id } = req.params;
  try {
    const connection = await database.getConnection();
    const [result] = await connection.query(
      "UPDATE disponibilidad_semanal SET ? WHERE id = ?",
      [value, id],
    );
    if (result.affectedRows === 0) {
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
    const connection = await database.getConnection();
    const [rutine] = await connection.query(
      "SELECT * FROM disponibilidad_semanal WHERE id = ?",
      [id],
    );
    if (rutine.username !== req.user.username) {
      return res
        .status(403)
        .send({
          status: "Error",
          message: "No tienes permiso para eliminar esta disponibilidad",
        });
    }
    const [result] = await connection.query(
      "DELETE FROM disponibilidad_semanal WHERE id = ?",
      [id],
    );

    if (result.affectedRows === 0) {
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
    const connection = await database.getConnection();
    const [rows] = await connection.query(
      "SELECT * FROM disponibilidad_semanal WHERE id = ?",
      [id],
    );
    if (rows[0].username !== req.user.username) {
      return res
        .status(403)
        .send({
          status: "Error",
          message: "No tienes permiso para acceder a esta disponibilidad",
        });
    }
    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
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

async function getDisponibilidadesByUsername(req, res) {
  const { username } = req.params;
  try {
    const connection = await database.getConnection();
    const [userRows] = await connection.query(
      "SELECT username FROM users WHERE username = ?",
      [username],
    );
    if (!userRows || userRows.length === 0) {
      return res
        .status(404)
        .send({ status: "Error", message: "Usuario no encontrado" });
    }

    const [rows] = await connection.query(
      "SELECT * FROM disponibilidad_semanal WHERE username = ? ORDER BY FIELD(dia_semana, 'Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'), hora_inicio",
      [username],
    );
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidades encontradas",
      disponibilidades: rows,
    });
  } catch (error) {
    return res.status(500).send({
      status: "Error",
      message: "Error al obtener disponibilidades del usuario",
    });
  }
}

async function getDisponibilidadesByUsernameAndFinalidad(req, res) {
  const { username, finalidad } = req.params;
  try {
    const connection = await database.getConnection();
    const [rows] = await connection.query(
      "SELECT * FROM disponibilidad_semanal WHERE username = ? AND finalidad = ? ORDER BY FIELD(dia_semana, 'Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'), hora_inicio",
      [username, finalidad],
    );
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidades por finalidad encontradas",
      disponibilidades: rows,
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
  getDisponibilidadesByUsername,
  getDisponibilidadesByUsernameAndFinalidad,
};
