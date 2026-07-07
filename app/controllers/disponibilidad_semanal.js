import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
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
    const disponibilidad = await prisma.disponibilidadSemanal.create({
      data: {
        user_id: user.id,
        dia_semana: data.data.dia_semana,
        hora_inicio: data.data.hora_inicio,
        hora_fin: data.data.hora_fin,
        transport_needed: data.data.transport_needed ? 1 : 0,
        transporte: data.data.transporte ?? null,
        estado: data.data.estado,
        finalidad: data.data.finalidad,
        origen: data.data.origen,
        destino: data.data.destino,
      },
    });

    return res.status(200).send({
      status: "Success",
      message: "Disponibilidad creada correctamente",
      disponibilidad,
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
    const existing = await prisma.disponibilidadSemanal.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    if (String(existing.user_id) !== String(req.user?.id)) {
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

    if ("transport_needed" in value) {
      value.transport_needed = value.transport_needed ? 1 : 0;
    }

    await prisma.disponibilidadSemanal.update({
      where: { id: Number(id) },
      data: value,
    });

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
    const existing = await prisma.disponibilidadSemanal.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    if (String(existing.user_id) !== String(req.user?.id)) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para eliminar esta disponibilidad",
      });
    }
    await prisma.disponibilidadSemanal.delete({
      where: { id: Number(id) },
    });

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
    const row = await prisma.disponibilidadSemanal.findUnique({
      where: { id: Number(id) },
    });
    if (!row) {
      return res
        .status(404)
        .send({ status: "Error", message: "Disponibilidad no encontrada" });
    }
    if (String(row.user_id) !== String(req.user?.id)) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para acceder a esta disponibilidad",
      });
    }
    return res.status(200).send({
      status: "Success",
      message: "Disponibilidad encontrada",
      disponibilidad: row,
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
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existingUser) {
      return res
        .status(404)
        .send({ status: "Error", message: "Usuario no encontrado" });
    }

    const dayOrder = [
      "Lunes",
      "Martes",
      "Miercoles",
      "Jueves",
      "Viernes",
      "Sabado",
      "Domingo",
    ];
    const rows = await prisma.disponibilidadSemanal.findMany({
      where: { user_id: userId },
      orderBy: { hora_inicio: "asc" },
    });
    rows.sort((a, b) => {
      const ai = dayOrder.indexOf(a.dia_semana);
      const bi = dayOrder.indexOf(b.dia_semana);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

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

async function getDisponibilidadesByUserIdAndFinalidad(req, res) {
  const { userId, finalidad } = req.params;
  try {
    const dayOrder = [
      "Lunes",
      "Martes",
      "Miercoles",
      "Jueves",
      "Viernes",
      "Sabado",
      "Domingo",
    ];
    const rows = await prisma.disponibilidadSemanal.findMany({
      where: { user_id: userId, finalidad },
      orderBy: { hora_inicio: "asc" },
    });
    rows.sort((a, b) => {
      const ai = dayOrder.indexOf(a.dia_semana);
      const bi = dayOrder.indexOf(b.dia_semana);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

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
  getDisponibilidadesByUserId,
  getDisponibilidadesByUserIdAndFinalidad,
};
