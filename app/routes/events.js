import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";
import { methods as events } from "../controllers/events.js";

const router = Router();

// Rutas estáticas antes de rutas parametrizadas (:id)
router.get("/", events.getAllEvents);
router.get("/nearby", events.getNearbyEvents);
router.get("/me/joined", authorization.isLoged, events.getMyJoinedEvents);
router.get("/code/:code", authorization.isLoged, events.getEventByCode);
router.post("/", enterpriseAuthorization.isEnterpriseOrAdmin, events.createEvent);

router.get("/:id", authorization.tryAuthenticate, events.getEventById);
router.get("/:id/details", authorization.tryAuthenticate, events.getEventById);
router.patch(
  "/:id",
  enterpriseAuthorization.isEnterpriseOrAdmin,
  events.updateEvent,
);
router.delete(
  "/:id",
  enterpriseAuthorization.isEnterpriseOrAdmin,
  events.deleteEvent,
);
router.post("/:id/join", authorization.isLoged, events.joinEvent);
router.delete("/:id/join", authorization.isLoged, events.leaveEvent);
router.get("/:id/participants", events.getEventParticipants);
router.get(
  "/:id/participants/details",
  authorization.isLoged,
  events.getEventParticipantsDetailed,
);

export default router;
