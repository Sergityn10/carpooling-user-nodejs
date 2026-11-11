import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as companies } from "../controllers/companies.js";

const router = Router();

router.get("/", authorization.isLoged, companies.getAllCompanies);
router.get("/:id", authorization.isLoged, companies.getCompanyById);
router.post("/", authorization.onlyAdmin, companies.createCompany);
router.patch("/:id", authorization.onlyAdmin, companies.updateCompany);
router.delete("/:id", authorization.onlyAdmin, companies.deleteCompany);

export default router;
