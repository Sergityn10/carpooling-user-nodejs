import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";

import authRoutes from "./auth.js";
import usersRoutes, { userSingularRouter } from "./users.js";
import enterpriseRoutes, { enterprisesRouter } from "./enterprise.js";
import eventsRoutes from "./events.js";
import tagsRoutes from "./tags.js";
import paymentRoutes, {
  monederoRouter,
  walletConfigUserRouter,
} from "./payment.js";
import carsRoutes from "./cars.js";
import routinesRoutes from "./routines.js";
import caeReportsRoutes from "./cae-reports.js";
import companiesRoutes from "./companies.js";
import suggestionsRoutes from "./suggestions.js";
import legalConsentsRoutes from "./legal-consents.js";
import telegramInfoRoutes from "./telegram-info.js";
import adminRoutes from "./admin.js";

const router = Router();

router.get("/test", authorization.isLoged, (req, res) => {
  res
    .status(200)
    .send({ status: "Success", message: "API is working correctly" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/user", userSingularRouter);
router.use("/enterprise", enterpriseRoutes);
router.use("/enterprises", enterprisesRouter);
router.use("/events", eventsRoutes);
router.use("/tags", tagsRoutes);
router.use("/payment", paymentRoutes);
router.use("/monedero", monederoRouter);
router.use("/wallet-config", walletConfigUserRouter);
router.use("/cars", carsRoutes);
router.use("/routines", routinesRoutes);
router.use("/cae-reports", caeReportsRoutes);
router.use("/companies", companiesRoutes);
router.use("/suggestions", suggestionsRoutes);
router.use("/legal-consents", legalConsentsRoutes);
router.use("/telegram-info", telegramInfoRoutes);
router.use("/admin", adminRoutes);

export default router;
