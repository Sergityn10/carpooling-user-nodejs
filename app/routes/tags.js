import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as events } from "../controllers/events.js";

const router = Router();

router.get("/", authorization.isLoged, events.getAllTags);
router.post("/", authorization.onlyAdmin, events.createTag);
router.delete("/:id", authorization.onlyAdmin, events.deleteTag);

export default router;
