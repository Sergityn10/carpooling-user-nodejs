import { Prisma } from "@prisma/client";
import AppError from "../utils/appError.js";

function sendDevError(err, res) {
  res.status(err.statusCode).json({
    status: err.status,
    errorCode: err.errorCode,
    error: err,
    message: err.message,
    stack: err.stack,
  });
}

function sendProdError(err, res) {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      errorCode: err.errorCode,
      message: err.message,
    });
  } else {
    console.error("ERROR CRÍTICO 💥", err);
    res.status(500).json({
      status: "error",
      errorCode: "SERVER_ERROR",
      message: "Algo salió mal. Por favor, inténtalo de nuevo más tarde.",
    });
  }
}

function handlePrismaError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return new AppError(
          "Ya existe un registro con alguno de los datos proporcionados (email, DNI, etc.).",
          409,
          "DUPLICATE_ENTRY",
        );
      case "P2025":
        return new AppError("El registro no fue encontrado.", 404, "NOT_FOUND");
      case "P2003":
        return new AppError(
          "Violación de clave foránea: el recurso relacionado no existe.",
          400,
          "FOREIGN_KEY_CONSTRAINT",
        );
      default:
        return new AppError(
          `Error de base de datos: ${err.code}`,
          500,
          "DATABASE_ERROR",
        );
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      "Error de validación en la consulta a la base de datos.",
      400,
      "DB_VALIDATION_ERROR",
    );
  }

  return err;
}

const errorHandler = (err, req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  let error = err;
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError
  ) {
    error = handlePrismaError(err);
    err.statusCode = error.statusCode;
    err.status = error.status;
    err.errorCode = error.errorCode;
    err.message = error.message;
    err.isOperational = true;
  }

  if (process.env.NODE_ENV === "development") {
    sendDevError(err, res);
  } else {
    sendProdError(err, res);
  }
};

export default errorHandler;
