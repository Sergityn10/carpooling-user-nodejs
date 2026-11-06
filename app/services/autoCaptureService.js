import Stripe from "stripe";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { eventBus } from "./eventBus.js";
import { cacheService } from "./cacheService.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const DEFAULT_THRESHOLD_DAYS = parseInt(
  process.env.STRIPE_AUTOCAPTURE_DAYS ?? "5",
  10,
);
const DEFAULT_INTERVAL_MS = parseInt(
  process.env.STRIPE_AUTOCAPTURE_INTERVAL_MS ?? "3600000", // 1 hora por defecto
  10,
);

let timerId = null;

/**
 * Ejecuta una pasada de captura automática para PaymentIntents que se aproximan
 * a la ventana de expiración de 7 días de Stripe.
 */
async function runAutoCaptureOnce({
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
} = {}) {
  const thresholdDate = new Date(
    Date.now() - thresholdDays * 24 * 60 * 60 * 1000,
  );

  console.log(
    `[autoCaptureService] Buscando preautorizaciones anteriores a ${thresholdDate.toISOString()} (umbral: ${thresholdDays} días)...`,
  );

  // Buscar pagos en estado de preautorización que lleven >= thresholdDays sin capturar
  const pendingIntents = await prisma.paymentIntent.findMany({
    where: {
      state: { in: ["requires_capture", "checkout_completed"] },
      created_at: { lte: thresholdDate },
    },
    orderBy: { created_at: "asc" },
  });

  console.log(
    `[autoCaptureService] Encontrados ${pendingIntents.length} pagos pendientes de auto-captura.`,
  );

  const results = {
    total: pendingIntents.length,
    captured: [],
    alreadyCaptured: [],
    canceledOrExpired: [],
    errors: [],
  };

  for (const pi of pendingIntents) {
    try {
      const stripePI = await stripe.paymentIntents.retrieve(
        pi.stripe_payment_id,
      );

      // Si ya fue capturado en Stripe, sincronizar BD local
      if (stripePI.status === "succeeded") {
        await prisma.paymentIntent.update({
          where: { stripe_payment_id: pi.stripe_payment_id },
          data: { state: "succeeded" },
        });
        results.alreadyCaptured.push({
          payment_intent_id: pi.stripe_payment_id,
          id_reserva: pi.id_reserva,
        });
        continue;
      }

      // Si caducó o fue cancelado por Stripe
      if (stripePI.status === "canceled") {
        await prisma.paymentIntent.update({
          where: { stripe_payment_id: pi.stripe_payment_id },
          data: { state: "canceled" },
        });
        results.canceledOrExpired.push({
          payment_intent_id: pi.stripe_payment_id,
          id_reserva: pi.id_reserva,
          reason: stripePI.cancellation_reason ?? "abandoned",
        });
        continue;
      }

      // Si está en requires_capture, capturar inmediatamente
      if (stripePI.status === "requires_capture") {
        console.log(
          `[autoCaptureService] Capturando automáticamente ${pi.stripe_payment_id} para reserva ${pi.id_reserva}...`,
        );

        const capturedPI = await stripe.paymentIntents.capture(
          pi.stripe_payment_id,
        );

        await prisma.paymentIntent.update({
          where: { stripe_payment_id: pi.stripe_payment_id },
          data: { state: String(capturedPI.status) },
        });

        // Resolver usuarios para registrar en monedero y notificar
        let payerUserId =
          capturedPI.metadata?.id_user ?? capturedPI.metadata?.userId ?? null;
        let receiverUserId =
          capturedPI.metadata?.recipient_user_id ?? null;

        if (!payerUserId && capturedPI.customer) {
          const payer = await prisma.user.findFirst({
            where: { stripe_customer_account: String(capturedPI.customer) },
            select: { id: true },
          });
          payerUserId = payer?.id ?? null;
        }

        const destinationAccount =
          capturedPI.transfer_data?.destination ??
          capturedPI.metadata?.destination_account ??
          pi.destination_account;

        if (!receiverUserId && destinationAccount) {
          const receiver = await prisma.user.findFirst({
            where: { stripe_account: destinationAccount },
            select: { id: true },
          });
          receiverUserId = receiver?.id ?? null;
        }

        if (receiverUserId || destinationAccount) {
          await cacheService.invalidateBalance({
            userId: receiverUserId,
            stripeAccountId: destinationAccount,
          });
        }

        const grossAmountCents = Number(
          capturedPI.amount_received ?? capturedPI.amount ?? pi.amount,
        );
        const driverPriceCents = capturedPI.metadata?.driver_price_cents
          ? parseInt(capturedPI.metadata.driver_price_cents, 10)
          : Math.round(grossAmountCents / 1.15);
        const platformFeeCents = capturedPI.metadata?.platform_fee_cents
          ? parseInt(capturedPI.metadata.platform_fee_cents, 10)
          : grossAmountCents - driverPriceCents;

        if (pi.id_reserva) {
          try {
            await eventBus.paymentIntentCaptured(
              pi.stripe_payment_id,
              pi.id_reserva,
              grossAmountCents,
              String(capturedPI.currency ?? "eur").toLowerCase(),
              payerUserId,
              receiverUserId,
              driverPriceCents,
              platformFeeCents,
            );
          } catch (eventErr) {
            console.error(
              `[autoCaptureService] Error emitiendo payment_intent.captured:`,
              eventErr?.message ?? eventErr,
            );
          }
        }

        results.captured.push({
          payment_intent_id: pi.stripe_payment_id,
          id_reserva: pi.id_reserva,
          amount: grossAmountCents,
          status: capturedPI.status,
        });
      }
    } catch (err) {
      console.error(
        `[autoCaptureService] Error procesando captura de ${pi.stripe_payment_id}:`,
        err?.message ?? err,
      );
      results.errors.push({
        payment_intent_id: pi.stripe_payment_id,
        id_reserva: pi.id_reserva,
        error: err?.message ?? String(err),
      });
    }
  }

  console.log(
    `[autoCaptureService] Pasada finalizada. Capturados: ${results.captured.length}, Previamente capturados: ${results.alreadyCaptured.length}, Cancelados/Expirados: ${results.canceledOrExpired.length}, Errores: ${results.errors.length}`,
  );

  return results;
}

/**
 * Inicia el cron / worker en segundo plano
 */
function startAutoCaptureJob({
  intervalMs = DEFAULT_INTERVAL_MS,
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
} = {}) {
  if (timerId) {
    clearInterval(timerId);
  }

  console.log(
    `[autoCaptureService] Iniciando worker de auto-captura (intervalo: ${intervalMs}ms, umbral: ${thresholdDays} días)`,
  );

  // Primera ejecución preventiva tras breve delay para no retrasar el boot inicial
  setTimeout(() => {
    runAutoCaptureOnce({ thresholdDays }).catch((err) => {
      console.error(
        "[autoCaptureService] Error en primera ejecución preventiva:",
        err?.message ?? err,
      );
    });
  }, 10000);

  timerId = setInterval(() => {
    runAutoCaptureOnce({ thresholdDays }).catch((err) => {
      console.error(
        "[autoCaptureService] Error en ciclo de auto-captura:",
        err?.message ?? err,
      );
    });
  }, intervalMs);

  if (typeof timerId.unref === "function") {
    timerId.unref();
  }
}

function stopAutoCaptureJob() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    console.log("[autoCaptureService] Worker de auto-captura detenido.");
  }
}

export const autoCaptureService = {
  runAutoCaptureOnce,
  startAutoCaptureJob,
  stopAutoCaptureJob,
};
