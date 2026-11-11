import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as caeReports } from "../controllers/cae-reports.js";

const router = Router();

// Rutas estáticas antes de :id
router.get("/summary", authorization.onlyAdmin, caeReports.getReportsSummary);
router.get("/", authorization.onlyAdmin, caeReports.listReports);
router.post("/", authorization.onlyAdmin, caeReports.createReport);

router.get("/:id", authorization.onlyAdmin, caeReports.getReportById);
router.patch("/:id/status", authorization.onlyAdmin, caeReports.updateReportStatus);
router.delete("/:id", authorization.onlyAdmin, caeReports.deleteReport);
router.get("/:id/export", authorization.onlyAdmin, caeReports.exportReportExcel);

export default router;
