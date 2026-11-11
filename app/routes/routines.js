import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as disponibilidad_semanal } from "../controllers/disponibilidad_semanal.js";

const router = Router();

router.get(
  "/user/:userId/finalidad/:finalidad",
  authorization.isLoged,
  disponibilidad_semanal.getDisponibilidadesByUserIdAndFinalidad,
);
router.get(
  "/user/:userId",
  authorization.isLoged,
  disponibilidad_semanal.getDisponibilidadesByUserId,
);
router.post(
  "/",
  authorization.isLoged,
  disponibilidad_semanal.createDisponibilidad,
);
router.get(
  "/:id",
  authorization.isLoged,
  disponibilidad_semanal.getDisponibilidad,
);
router.put(
  "/:id",
  authorization.isLoged,
  disponibilidad_semanal.updateDisponibilidad,
);
router.patch(
  "/:id",
  authorization.isLoged,
  disponibilidad_semanal.updateDisponibilidad,
);
router.delete(
  "/:id",
  authorization.isLoged,
  disponibilidad_semanal.removeDisponibilidad,
);

export default router;
