import { Router } from "express";
import { methods as authentication } from "../controllers/authentication.js";
import { unifiedAuthentication } from "../controllers/unified_authentication.js";
import { authLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.post("/unified-login", authLimiter, unifiedAuthentication.unifiedLogin);
router.post("/login", authLimiter, authentication.login);
router.get("/register/email/:email", authLimiter, authentication.existEmail);
router.post("/register", authLimiter, authentication.register);
router.get("/logout", authentication.logout);
router.post("/refresh", authentication.refresh);
router.get("/validate", authentication.validate);
router.post("/oauth", authentication.oauthGoogle);
router.post("/oauth/android", authentication.oauthGoogleAndroid);
router.get("/oauth/register", authentication.oauthGoogleRegisterCallback);
router.get("/oauth/login", authentication.oauthGoogleLoginCallback);

export default router;
