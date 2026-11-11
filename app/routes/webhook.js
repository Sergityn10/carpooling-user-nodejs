import express, { Router } from "express";
import { methods as webhook } from "../controllers/webhook.js";

const router = Router();

// Stripe webhooks need the raw body for signature verification
router.use((req, res, next) => {
  if (req.originalUrl === "/api/webhook/stripe" || req.path === "/stripe") {
    return express.raw({ type: "application/json" })(req, res, next);
  }
  return next();
});

router.post("/:source", webhook.createEvent);

export default router;
