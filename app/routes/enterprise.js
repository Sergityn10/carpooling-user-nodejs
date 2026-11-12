import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";
import { methods as enterpriseAuthentication } from "../controllers/enterprise_authentication.js";
import { methods as enterprise } from "../controllers/enterprise.js";
import { methods as enterpriseServiceEvents } from "../controllers/enterprise_service_events.js";
import { enterpriseMembers } from "../controllers/enterprise_members.js";
import { methods as events } from "../controllers/events.js";

// Nota: Las rutas administrativas (/api/admin/enterprises*) residen en routes/admin.js
const router = Router();

// --- Enterprise Public Auth ---
router.post("/auth/register", enterpriseAuthentication.register);
router.post("/auth/login", enterpriseAuthentication.login);
router.post("/auth/logout", enterpriseAuthentication.logout);
router.get("/auth/logout", enterpriseAuthentication.logout);
router.get("/auth/validate", enterpriseAuthentication.validate);

// --- Google OAuth for Enterprise ---
router.post("/auth/oauth", enterpriseAuthentication.oauthGoogle);
router.get(
  "/auth/oauth/register",
  enterpriseAuthentication.oauthGoogleRegisterCallback,
);
router.get(
  "/auth/oauth/login",
  enterpriseAuthentication.oauthGoogleLoginCallback,
);
router.post("/auth/google", enterpriseAuthentication.oauthGoogleToken);
router.post("/auth/oauth/google", enterpriseAuthentication.oauthGoogleToken);

// --- Enterprise Self-Service & Metrics ---
router.get("/me", enterpriseAuthorization.isEnterpriseLoged, enterprise.getMe);
router.patch(
  "/me",
  enterpriseAuthorization.isEnterpriseLoged,
  enterprise.patchMe,
);
router.patch(
  "/auth/change-password",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseAuthentication.changePassword,
);
router.get(
  "/metrics",
  enterpriseAuthorization.isEnterpriseLoged,
  enterprise.getMyMetrics,
);
router.get(
  "/events",
  enterpriseAuthorization.isEnterpriseLoged,
  events.getMyEnterpriseEvents,
);

// --- Enterprise Service Events ---
router.post(
  "/service-events",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseServiceEvents.create,
);
router.get(
  "/service-events",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseServiceEvents.list,
);
router.get(
  "/service-events/:id",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseServiceEvents.getById,
);
router.get(
  "/service-events/:id/metrics",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseServiceEvents.getMetrics,
);
router.patch(
  "/service-events/:id",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseServiceEvents.patch,
);
router.delete(
  "/service-events/:id",
  enterpriseAuthorization.isEnterpriseLoged,
  enterpriseServiceEvents.remove,
);

// --- Invitations & Corporate Members ---
router.get("/invitations/validate", enterpriseMembers.validateInvitation);
router.post(
  "/invitations/accept",
  authorization.isLoged,
  enterpriseMembers.acceptInvitation,
);

router.post(
  "/:enterpriseId/members/invite",
  enterpriseAuthorization.requireEnterpriseRole("ADMIN"),
  enterpriseMembers.inviteMember,
);
router.get(
  "/:enterpriseId/members",
  enterpriseAuthorization.requireEnterpriseRole("MANAGER"),
  enterpriseMembers.getMembers,
);
router.patch(
  "/:enterpriseId/members/:memberId/role",
  enterpriseAuthorization.requireEnterpriseRole("ADMIN"),
  enterpriseMembers.changeMemberRole,
);
router.delete(
  "/:enterpriseId/members/:memberId",
  enterpriseAuthorization.requireEnterpriseRole("ADMIN"),
  enterpriseMembers.removeMember,
);
router.get(
  "/:enterpriseId/invitations",
  enterpriseAuthorization.requireEnterpriseRole("ADMIN"),
  enterpriseMembers.getPendingInvitations,
);
router.delete(
  "/:enterpriseId/invitations/:invitationId",
  enterpriseAuthorization.requireEnterpriseRole("ADMIN"),
  enterpriseMembers.revokeInvitation,
);

// --- Shared Enterprise Operations (/api/enterprises/:id) ---
export const enterprisesRouter = Router();
enterprisesRouter.get(
  "/:id",
  enterpriseAuthorization.isEnterpriseOrAdmin,
  enterprise.getEnterpriseById,
);
enterprisesRouter.patch(
  "/:id",
  enterpriseAuthorization.isEnterpriseOrAdmin,
  enterprise.updateEnterprise,
);
enterprisesRouter.put(
  "/:id",
  enterpriseAuthorization.isEnterpriseOrAdmin,
  enterprise.updateEnterprise,
);

export default router;
