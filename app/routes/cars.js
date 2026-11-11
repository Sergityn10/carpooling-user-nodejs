import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as cars } from "../controllers/cars.js";

const router = Router();

router.get("/user/:userId", authorization.isLoged, cars.getCarsByUserId);
router.post("/", authorization.isLoged, cars.createCar);
router.get("/:id", authorization.isLoged, cars.getCar);
router.put("/:id", authorization.isLoged, cars.updateCar);
router.delete("/:id", authorization.isLoged, cars.removeCar);

export default router;
