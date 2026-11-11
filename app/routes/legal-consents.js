import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as legalConsent } from "../controllers/legalConsent.js";

const router = Router();

router.get("/", authorization.onlyAdmin, legalConsent.getAllConsents);
router.get("/summary", authorization.onlyAdmin, legalConsent.getConsentSummary);
router.get("/me", authorization.isLoged, legalConsent.getMyConsents);
router.get(
  "/without/:documentType",
  authorization.onlyAdmin,
  legalConsent.getUsersWithoutConsent,
);
router.get(
  "/user/:userId",
  authorization.onlyAdmin,
  legalConsent.getConsentsByUser,
);

export default router;
