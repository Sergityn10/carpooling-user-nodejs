import { CocheSchemas } from "../schemas/coche.js";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { eventBus } from "../services/eventBus.js";
dotenv.config();

async function createCar(req, res) {
  const data = CocheSchemas.validateCocheSinId(req.body);
  if (!data.success) {
    return res
      .status(400)
      .send({ status: "Error", message: data.error.message });
  }

  const user = req.user;
  try {
    const car = await prisma.car.create({
      data: {
        matricula: data.data.matricula,
        marca: data.data.marca,
        modelo: data.data.modelo,
        color: data.data.color ?? null,
        tipo_combustible: data.data.tipo_combustible,
        num_plazas: data.data.num_plazas,
        user_id: user.id,
        year: data.data.year,
      },
    });
    await eventBus.carCreated(car.id_coche, user.id);
    return res
      .status(200)
      .send({ status: "Success", message: "Car created successfully", car });
  } catch (error) {
    if (error?.code === "P2002") {
      return res
        .status(400)
        .send({ status: "Error", message: "Car already exists" });
    }
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to create car" });
  }
}

async function updateCar(req, res) {
  const parsed = CocheSchemas.validateCochePartial(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .send({ status: "Error", message: parsed.error.message });
  }
  const { id: id_coche } = req.params;
  const value = { ...parsed.data };
  delete value.id_coche;
  delete value.user_id;

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
  }

  try {
    const existingCar = await prisma.car.findUnique({ where: { id_coche } });
    if (!existingCar) {
      return res
        .status(404)
        .send({ status: "Error", message: "Car not found" });
    }
    if (
      String(existingCar.user_id) !== String(req.user?.id) &&
      req.user?.role?.name !== "admin"
    ) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para modificar este vehículo.",
      });
    }

    const car = await prisma.car.update({
      where: { id_coche },
      data: value,
    });
    await eventBus.carUpdated(id_coche, value);
    return res
      .status(200)
      .send({ status: "Success", message: "Car updated successfully", car });
  } catch (error) {
    if (error?.code === "P2025") {
      return res
        .status(404)
        .send({ status: "Error", message: "Car not found" });
    }
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to update car" });
  }
}

async function removeCar(req, res) {
  const { id: id_coche } = req.params;
  try {
    const existingCar = await prisma.car.findUnique({ where: { id_coche } });
    if (!existingCar) {
      return res
        .status(404)
        .send({ status: "Error", message: "Car not found" });
    }
    if (
      String(existingCar.user_id) !== String(req.user?.id) &&
      req.user?.role?.name !== "admin"
    ) {
      return res.status(403).send({
        status: "Error",
        message: "No tienes permiso para eliminar este vehículo.",
      });
    }

    await prisma.car.delete({ where: { id_coche } });
    await eventBus.carDeleted(id_coche);
    return res
      .status(200)
      .send({ status: "Success", message: "Car deleted successfully" });
  } catch (error) {
    if (error?.code === "P2025") {
      return res
        .status(404)
        .send({ status: "Error", message: "Car not found" });
    }
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to delete car" });
  }
}

async function getCar(req, res) {
  const { id: id_coche } = req.params;
  const car = await prisma.car.findUnique({ where: { id_coche } });
  if (!car) {
    return res.status(404).send({ status: "Error", message: "Car not found" });
  }
  if (
    String(car.user_id) !== String(req.user?.id) &&
    req.user?.role?.name !== "admin"
  ) {
    return res.status(403).send({
      status: "Error",
      message: "No tienes autorización para acceder a los datos de este vehículo.",
    });
  }
  return res.status(200).send({
    status: "Success",
    message: "Car found successfully",
    car,
  });
}

async function getCarsByUserId(req, res) {
  const { userId } = req.params;
  if (
    String(userId) !== String(req.user?.id) &&
    req.user?.role?.name !== "admin"
  ) {
    return res.status(403).send({
      status: "Error",
      message: "No tienes autorización para consultar los vehículos de este usuario.",
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existingUser) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }
  const cars = await prisma.car.findMany({ where: { user_id: userId } });
  return res.status(200).send({
    status: "Success",
    message: "Cars found successfully",
    cars,
  });
}

export const methods = {
  createCar,
  updateCar,
  removeCar,
  getCar,
  getCarsByUserId,
};
