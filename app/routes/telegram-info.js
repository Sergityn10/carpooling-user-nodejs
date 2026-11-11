import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { TelegramInfoServices as telegramInfo } from "../controllers/telegramInfo.js";

const router = Router();

router.get("/", authorization.isLoged, telegramInfo.getAll);
router.post("/bulk", authorization.isLoged, telegramInfo.bulkCreate);
router.post("/", authorization.isLoged, telegramInfo.create);
router.get("/:id", authorization.isLoged, telegramInfo.getById);
router.put("/:id", authorization.isLoged, telegramInfo.updatePut);
router.patch("/:id", authorization.isLoged, telegramInfo.updatePatch);
router.delete("/:id", authorization.isLoged, telegramInfo.remove);

export default router;
