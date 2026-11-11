import { Router } from "express";
import { authorization } from "../middlewares/authorization.js";
import { paymentLimiter } from "../middlewares/rateLimiter.js";
import { methods as payment } from "../controllers/payment.js";
import { methods as walletConfig } from "../controllers/walletConfig.js";

// Nota: Las rutas administrativas de pagos/cuentas (/api/admin/stripe-connect*, /api/admin/wallet-config*, /api/admin/accounts*) residen en routes/admin.js
const router = Router();

// --- Sesiones y Stripe Connect ---
router.post("/session", payment.createSession);
router.post(
  "/stripe-connect",
  authorization.isLoged,
  payment.createStripeConnectAccount,
);
router.get(
  "/stripe-connect",
  authorization.isLoged,
  payment.getMyStripeConnectAccount,
);
router.post(
  "/stripe-connect-link",
  authorization.isLoged,
  payment.createAccountLink,
);
router.get(
  "/stripe-connect-link",
  authorization.isLoged,
  (req, res, next) => {
    req.body = {
      return_url: req.query.return_url,
      refresh_url: req.query.refresh_url,
    };
    payment.createAccountLink(req, res, next);
  },
);
router.get("/stripe-redirect", payment.stripeRedirect);
router.post(
  "/stripe-customer",
  authorization.isLoged,
  payment.createStripeCustomer,
);
router.get(
  "/stripe-customer",
  authorization.isLoged,
  payment.getMyStripeCustomerAccount,
);
router.post(
  "/stripe-link",
  authorization.isLoged,
  payment.createStripeLinkAccount,
);
router.post(
  "/stripe-transfer",
  authorization.isLoged,
  payment.createStripeTransfer,
);
router.post(
  "/stripe-login-link",
  authorization.isLoged,
  payment.createLoginLink,
);
router.get(
  "/stripe-billing-portal",
  authorization.isLoged,
  payment.createBillingPortal,
);

// --- Monedero, Balance, Movimientos y Retiros ---
router.get("/cash-balance", authorization.isLoged, payment.getCashBalance);
router.get("/wallet-balance", authorization.isLoged, payment.getWalletBalance);
router.get(
  "/wallet-transactions",
  authorization.isLoged,
  payment.getWalletTransactions,
);
router.get("/movements", authorization.isLoged, payment.getMovements);
router.get("/movements/stream", authorization.isLoged, payment.streamMovements);
router.post(
  "/wallet-payout",
  authorization.isLoged,
  paymentLimiter,
  payment.createWalletPayout,
);
router.get(
  "/wallet-payouts",
  authorization.isLoged,
  paymentLimiter,
  payment.getWalletPayouts,
);
router.post(
  "/payout",
  authorization.isLoged,
  paymentLimiter,
  payment.createPayout,
);
router.post(
  "/recharge",
  authorization.isLoged,
  paymentLimiter,
  payment.rechargeWalletUser,
);
router.post("/bank_account", authorization.isLoged, payment.createBankAccount);

// --- Payment Intents y Cotización ---
router.post("/payment-intent", authorization.isLoged, payment.createPaymentIntent);
router.post(
  "/payment-intent/checkout",
  authorization.isLoged,
  payment.createCheckoutPaymentIntent,
);
router.post("/calculate-price", authorization.isLoged, payment.calculatePrice);
router.get("/cotizar", payment.cotizar);
router.post(
  "/payment-intent/resume",
  authorization.isLoged,
  payment.resumeCheckoutPaymentIntent,
);
router.get(
  "/payment-intent/:id_reserva/checkout-link",
  authorization.isLoged,
  payment.getPaymentIntentCheckoutLink,
);
router.post(
  "/payment-intent/capture",
  authorization.isLoged,
  payment.capturePaymentIntent,
);
router.post(
  "/trayecto/capture",
  authorization.isLoged,
  payment.captureTripPayments,
);
router.post("/auto-capture-expiring", payment.triggerAutoCapture);
router.post(
  "/payment-intent/cancel",
  authorization.isLoged,
  payment.cancelPaymentIntent,
);

// --- Alias relacionados con monedero y configuración de usuario ---
export const monederoRouter = Router();
monederoRouter.get(
  "/cuenta-vinculada",
  authorization.isLoged,
  payment.getLinkedExternalAccounts,
);

export const walletConfigUserRouter = Router();
walletConfigUserRouter.get(
  "/me",
  authorization.isLoged,
  walletConfig.getMyWalletConfig,
);

export default router;
