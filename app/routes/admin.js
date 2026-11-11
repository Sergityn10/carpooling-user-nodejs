import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { methods as enterprise } from "../controllers/enterprise.js";
import { methods as walletConfig } from "../controllers/walletConfig.js";
import { methods as payment } from "../controllers/payment.js";
import { methods as account } from "../controllers/account.js";

const router = Router();

// --- Enterprise Admin Management ---
router.post(
  "/enterprises",
  authorization.onlyAdmin,
  enterprise.createEnterpriseByAdmin,
);
router.get(
  "/enterprises",
  authorization.onlyAdmin,
  enterprise.getAllEnterprises,
);
router.get(
  "/enterprises/metrics",
  authorization.onlyAdmin,
  enterprise.getEnterpriseMetrics,
);
router.delete(
  "/enterprises/:id",
  authorization.onlyAdmin,
  enterprise.softDeleteEnterprise,
);
router.patch(
  "/enterprises/:id/restore",
  authorization.onlyAdmin,
  enterprise.restoreEnterprise,
);
router.patch(
  "/enterprises/:id/password",
  authorization.onlyAdmin,
  enterprise.adminResetPassword,
);

// --- Wallet Config (Admin) ---
router.get(
  "/wallet-config",
  authorization.onlyAdmin,
  walletConfig.listWalletConfigs,
);
router.get(
  "/wallet-config/:userId",
  authorization.onlyAdmin,
  walletConfig.getWalletConfig,
);
router.put(
  "/wallet-config/:userId",
  authorization.onlyAdmin,
  walletConfig.upsertWalletConfig,
);
router.patch(
  "/wallet-config/:userId/toggle",
  authorization.onlyAdmin,
  walletConfig.toggleWallet,
);
router.delete(
  "/wallet-config/:userId",
  authorization.onlyAdmin,
  walletConfig.resetWalletConfig,
);

// --- Admin Stripe Onboarding ---
router.get(
  "/stripe-connect/:userId",
  authorization.onlyAdmin,
  payment.adminGetStripeConnectAccount,
);
router.post(
  "/stripe-connect/:userId",
  authorization.onlyAdmin,
  payment.adminCreateStripeConnectAccount,
);
router.post(
  "/stripe-connect/:userId/account-link",
  authorization.onlyAdmin,
  payment.adminCreateAccountLink,
);
router.post(
  "/stripe-connect/:userId/login-link",
  authorization.onlyAdmin,
  payment.adminCreateLoginLink,
);

// --- Admin Accounts (Stripe Connect states) ---
router.get("/accounts", authorization.onlyAdmin, account.listAccounts);
router.post("/accounts", authorization.onlyAdmin, account.createAccount);
router.post(
  "/accounts/sync/:userId",
  authorization.onlyAdmin,
  account.syncAccountFromStripe,
);
router.get(
  "/accounts/:stripeAccountId",
  authorization.onlyAdmin,
  account.getAccount,
);
router.patch(
  "/accounts/:stripeAccountId",
  authorization.onlyAdmin,
  account.updateAccount,
);
router.delete(
  "/accounts/:stripeAccountId",
  authorization.onlyAdmin,
  account.deleteAccount,
);

export default router;
