import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as suggestions } from "../controllers/suggestions.js";

const router = Router();

router.get("/", authorization.onlyAdmin, suggestions.listSuggestions);
router.post("/", authorization.isLoged, suggestions.createSuggestion);
router.get("/:id", authorization.onlyAdmin, suggestions.getSuggestionById);
router.patch("/:id", authorization.onlyAdmin, suggestions.updateSuggestion);
router.delete("/:id", authorization.onlyAdmin, suggestions.deleteSuggestion);
router.post("/:id/accept", authorization.onlyAdmin, suggestions.acceptSuggestion);

export default router;
