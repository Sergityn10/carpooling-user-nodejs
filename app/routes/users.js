import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as user } from "../controllers/user.js";
import { enterpriseMembers } from "../controllers/enterprise_members.js";

const router = Router();

// Rutas estáticas antes de rutas parametrizadas (:id)
router.get("/", authorization.onlyAdmin, user.getAllUsers);
router.get("/unique-by-location", user.getUniqueUsersByLocation);
router.get("/info", authorization.isLoged, user.getMyUserInfo);
router.post("/public/batch", user.getPublicUsersBatch);
router.patch("/", authorization.isLoged, user.updateMyUserPatch);

router.get("/:id", authorization.isLoged, user.getUserById);
router.get("/:id/info", authorization.tryAuthenticate, user.getUserInfo);
router.get("/:id/public", user.getPublicUserInfo);
router.get("/:id/profile", user.getPublicUserProfile);
router.patch("/:id", authorization.isLoged, user.updateUserPatch);
router.delete("/:id", authorization.isLoged, user.removeUser);

// Rutas bajo /api/user (singular)
export const userSingularRouter = Router();
userSingularRouter.get(
  "/my-organizations",
  authorization.isLoged,
  enterpriseMembers.getMyCorporateMemberships,
);

export default router;
