import prisma from "../lib/prisma.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const status = {
  1: "pending",
  2: "succeeded",
  3: "failed",
  4: "canceled",
  5: "abandoned",
  6: "updated",
  7: "expired",
  8: "completed",
};

function isLikelyStripeWebhookRequest(req) {
  return (
    Buffer.isBuffer(req.body) ||
    typeof req.headers?.["stripe-signature"] === "string" ||
    typeof req.headers?.["Stripe-Signature"] === "string"
  );
}

function getStripeSignatureHeader(req) {
  console.log(req.headers);
  return (
    req.headers?.["stripe-signature"] ||
    req.headers?.["Stripe-Signature"] ||
    null
  );
}

function parseStripeEventFromRequest(req) {
  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET_KEY ||
    null;
  const signature = getStripeSignatureHeader(req);

  if (!Buffer.isBuffer(req.body)) {
    // fallback: if body was already parsed as JSON (e.g. non-stripe sources)
    return { event: req.body, verified: false };
  }

  if (!webhookSecret || !signature) {
    // Can't verify, but still parse (useful for local debugging)
    try {
      return {
        event: JSON.parse(req.body.toString("utf8")),
        verified: false,
      };
    } catch (e) {
      throw new Error("Invalid raw webhook payload (missing secret/signature)");
    }
  }

  const event = stripe.webhooks.constructEvent(
    req.body,
    signature,
    webhookSecret,
  );
  return { event, verified: true };
}

async function createEvent(req, res) {
  const { source } = req.params;

  let stripeEvent = null;
  let verified = false;
  let parsedBody = req.body;

  if (source === "stripe" && isLikelyStripeWebhookRequest(req)) {
    const parsed = parseStripeEventFromRequest(req);
    stripeEvent = parsed.event;
    verified = parsed.verified;
    parsedBody = stripeEvent;
  }

  const data = JSON.stringify(parsedBody);
  const eventId = parsedBody?.id ?? null;
  const eventType = String(parsedBody?.type ?? "unknown");
  const stripeObj = parsedBody?.data?.object;
  const paymentIntentId =
    (stripeObj?.object === "payment_intent"
      ? stripeObj?.id
      : stripeObj?.object === "checkout.session"
        ? stripeObj?.payment_intent
        : (stripeObj?.payment_intent ?? null)) ?? null;

  try {
    await prisma.event.upsert({
      where: { event_id: eventId },
      create: {
        event_id: eventId,
        event_type: eventType,
        payment_intent_id: paymentIntentId,
        data: data,
        source: source,
        status: status[1],
      },
      update: {
        event_type: eventType,
        payment_intent_id: paymentIntentId ?? undefined,
        data: data,
        source: source,
        status: status[1],
      },
    });

    if (source === "stripe") {
      req.body = parsedBody;
      await handleStripeEvent(req, res);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    try {
      await prisma.event.update({
        where: { event_id: eventId },
        data: {
          status: status[3],
          processing_error: error?.message ?? String(error),
        },
      });
    } catch (_e) {}

    if (source === "stripe") {
      return res.status(500).send({
        status: "Error",
        message: "Stripe event received but processing failed",
      });
    }

    return res.status(200).send({
      status: "Success",
      message: "Event received (processing failed)",
    });
  }

  await prisma.event.update({
    where: { event_id: eventId },
    data: { status: status[2] },
  });

  return res
    .status(200)
    .send({ status: "Success", message: "Event created successfully" });
}

async function handleStripeEvent(req, res) {
  const { source } = req.params;
  const jsonData = req.body;
  const data = JSON.stringify(req.body);

  if (
    jsonData.type === "account.created" ||
    jsonData.type === "account.updated"
  ) {
    await handleAccountUpdated(jsonData.data);
  }
  if (jsonData.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(jsonData);
  }
  if (jsonData.type === "checkout.session.expired") {
    await handleCheckoutSessionExpired(jsonData.data);
  }
  if (jsonData.type === "checkout.session.updated") {
    await handleCheckoutSessionUpdated(jsonData.data);
  }
  if (jsonData.type === "payment_intent.created") {
    await handlePaymentIntentCreated(jsonData.data);
  }
  if (jsonData.type === "payment_intent.updated") {
    await handlePaymentIntentUpdated(jsonData.data);
  }
  if (jsonData.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(jsonData.data);
  }
  if (jsonData.type === "payment_intent.failed") {
    await handlePaymentIntentFailed(jsonData.data);
  }
  if (jsonData.type === "payment_intent.canceled") {
    await handlePaymentIntentCanceled(jsonData.data);
  }
  if (jsonData.type === "customer.created") {
    await handleCustomerCreated(jsonData.data);
  }
  if (jsonData.type === "customer.updated") {
    await handleCustomerUpdated(jsonData.data);
  }
  if (jsonData.type === "customer.deleted") {
    await handleCustomerDeleted(jsonData.data);
  }
  if (jsonData.type === "charge.succeeded") {
    await handleChargeSucceeded(jsonData.data);
  }
  if (String(jsonData.type ?? "").startsWith("payout.")) {
    await handlePayoutEvent(jsonData);
  }
}
async function handleCustomerDeleted(jsonData) {}
async function handleChargeSucceeded(jsonData) {}

function mapStripePayoutStatusToLocalStatus(stripeStatus) {
  switch (String(stripeStatus ?? "").toLowerCase()) {
    case "paid":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "pending":
    case "in_transit":
    default:
      return "processing";
  }
}

async function handlePayoutEvent(stripeEvent) {
  const payout = stripeEvent?.data?.object;
  if (!payout) {
    return;
  }

  const stripePayoutId = payout.id ?? null;
  const stripeEventId = stripeEvent.id ?? null;
  const stripeStatus = payout.status ?? null;
  const localStatus = mapStripePayoutStatusToLocalStatus(stripeStatus);
  const failureReason = payout.failure_message ?? payout.failure_code ?? null;

  if (!stripePayoutId) {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (stripeEventId) {
        const already = await tx.walletPayout.findUnique({
          where: { stripe_event_id: stripeEventId },
          select: { id: true },
        });
        if (already) {
          return;
        }
      }

      let walletPayout = await tx.walletPayout.findFirst({
        where: { stripe_payout_id: stripePayoutId },
      });

      if (!walletPayout) {
        const walletPayoutIdRaw = payout?.metadata?.wallet_payout_id;
        if (walletPayoutIdRaw) {
          walletPayout = await tx.walletPayout.findUnique({
            where: { id: String(walletPayoutIdRaw) },
          });

          if (walletPayout) {
            await tx.walletPayout.update({
              where: { id: walletPayout.id },
              data: { stripe_payout_id: stripePayoutId },
            });
          }
        }
      }

      if (!walletPayout) {
        return;
      }

      const prevStatus = String(walletPayout.status ?? "");
      const isFinal =
        prevStatus === "succeeded" ||
        prevStatus === "failed" ||
        prevStatus === "canceled";
      if (isFinal) {
        return;
      }

      await tx.walletPayout.update({
        where: { id: walletPayout.id },
        data: {
          stripe_payout_status: stripeStatus,
          status: localStatus,
          stripe_event_id: stripeEventId ?? undefined,
          failure_reason: failureReason ?? undefined,
        },
      });

      if (localStatus === "succeeded") {
        await tx.walletTransaction.update({
          where: { id: walletPayout.wallet_transaction_id },
          data: { status: "succeeded" },
        });
        return;
      }

      if (localStatus === "failed" || localStatus === "canceled") {
        const txStatus = localStatus === "canceled" ? "canceled" : "failed";
        await tx.walletTransaction.update({
          where: { id: walletPayout.wallet_transaction_id },
          data: { status: txStatus },
        });

        const amount = Number(walletPayout.amount ?? 0);
        const account = await tx.walletAccount.findUnique({
          where: { id: walletPayout.wallet_account_id },
          select: { id: true, balance: true },
        });

        if (account && Number.isFinite(amount) && amount > 0) {
          const balanceBefore = Number(account.balance ?? 0);
          const updated = await tx.walletAccount.update({
            where: { id: account.id },
            data: { balance: { increment: amount } },
            select: { balance: true },
          });
          const balanceAfter = Number(
            updated.balance ?? balanceBefore + amount,
          );

          if (stripeEventId) {
            const existing = await tx.walletTransaction.findUnique({
              where: { stripe_event_id: stripeEventId },
              select: { id: true },
            });
            if (!existing) {
              await tx.walletTransaction.create({
                data: {
                  wallet_account_id: walletPayout.wallet_account_id,
                  user_id: walletPayout.user_id,
                  currency: walletPayout.currency,
                  type: "credit",
                  amount: amount,
                  status: "succeeded",
                  balance_before: balanceBefore,
                  balance_after: balanceAfter,
                  description: "Payout reversed",
                  stripe_event_id: stripeEventId,
                  stripe_payment_status: stripeStatus,
                },
              });
            }
          }
        }
        return;
      }

      await tx.walletTransaction.update({
        where: { id: walletPayout.wallet_transaction_id },
        data: { status: "pending" },
      });
    });
  } catch (error) {
    throw error;
  }
}
async function handlePaymentIntentCreated(jsonData) {
  const paymentIntent = jsonData.object;

  const stripePaymentIntentId = paymentIntent?.id ?? null;
  if (!stripePaymentIntentId) {
    return;
  }

  const amount = Number(paymentIntent?.amount ?? 0) / 100;
  const currency = String(paymentIntent?.currency ?? "eur").toLowerCase();
  const state = String(paymentIntent?.status ?? "pending");
  const clientSecret = paymentIntent?.client_secret ?? null;

  const destinationAccount = paymentIntent?.transfer_data?.destination ?? null;
  const senderAccount = paymentIntent?.metadata?.sender_account ?? null;
  const description = paymentIntent?.description ?? null;
  const id_reserva = paymentIntent?.metadata?.id_reserva ?? null;

  await prisma.paymentIntent.upsert({
    where: { stripe_payment_id: stripePaymentIntentId },
    create: {
      stripe_payment_id: stripePaymentIntentId,
      amount,
      currency,
      description,
      destination_account: destinationAccount,
      sender_account: senderAccount,
      state,
      client_secret: clientSecret,
      id_reserva,
    },
    update: {
      amount,
      currency,
      description: description ?? undefined,
      destination_account: destinationAccount ?? undefined,
      sender_account: senderAccount ?? undefined,
      state,
      client_secret: clientSecret ?? undefined,
      id_reserva: id_reserva ?? undefined,
    },
  });

  if (id_reserva) {
    const existing = await prisma.reserva.findUnique({
      where: { id_reserva },
      select: { stripe_payment_intent_id: true },
    });
    if (
      existing &&
      (!existing.stripe_payment_intent_id ||
        existing.stripe_payment_intent_id === stripePaymentIntentId)
    ) {
      await prisma.reserva.update({
        where: { id_reserva },
        data: { stripe_payment_intent_id: stripePaymentIntentId },
      });
    }
  }
}
async function handlePaymentIntentUpdated(jsonData) {
  const paymentIntent = jsonData.object;

  await prisma.reserva.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: { stripe_payment_intent_status: paymentIntent.status },
  });

  await prisma.walletRecharge.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: { stripe_payment_status: paymentIntent.status },
  });

  await prisma.walletTransaction.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: { stripe_payment_status: paymentIntent.status },
  });
}
async function handlePaymentIntentSucceeded(jsonData) {
  const paymentIntent = jsonData.object;
  let id_reserva = paymentIntent?.metadata?.id_reserva;
  if (!id_reserva) {
    const paymentIntentRow = await prisma.paymentIntent.findUnique({
      where: { stripe_payment_id: paymentIntent.id },
      select: { id_reserva: true },
    });
    id_reserva = paymentIntentRow?.id_reserva;
  }
  const stripePaymentIntentId = paymentIntent?.id ?? null;
  const currency = String(paymentIntent?.currency ?? "eur").toLowerCase();
  const grossAmountCents = Number(
    paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0,
  );

  if (
    !stripePaymentIntentId ||
    !Number.isFinite(grossAmountCents) ||
    grossAmountCents <= 0
  ) {
    return;
  }

  const paymentIntentRow = await prisma.paymentIntent.findUnique({
    where: { stripe_payment_id: stripePaymentIntentId },
    select: {
      sender_account: true,
      destination_account: true,
      description: true,
    },
  });
  const senderAccount = paymentIntentRow?.sender_account ?? null;
  const destinationAccount = paymentIntentRow?.destination_account ?? null;
  const paymentDescription = String(paymentIntentRow?.description ?? "");

  if (!senderAccount || !destinationAccount) {
    return;
  }

  const payerUser = await prisma.user.findFirst({
    where: { stripe_account: senderAccount },
    select: { id: true },
  });
  const receiverUser = await prisma.user.findFirst({
    where: { stripe_account: destinationAccount },
    select: { id: true },
  });

  const payerUserId = payerUser?.id ?? null;
  const receiverUserId = receiverUser?.id ?? null;

  const platformUserId =
    process.env.PLATFORM_USER_ID ?? process.env.COMMISSION_USER_ID ?? null;

  if (!payerUserId || !receiverUserId || !platformUserId) {
    throw new Error(
      "Missing payer/receiver/platform user id for wallet transactions",
    );
  }

  const commissionAmountCents = Math.round(grossAmountCents * 0.15);
  const netAmountCents = grossAmountCents - commissionAmountCents;

  if (netAmountCents < 0) {
    throw new Error("Invalid commission calculation (net < 0)");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.reserva.update({
        where: { id_reserva },
        data: { status: status[8] },
      });

      const ensureWalletAccount = async (userId) => {
        await tx.walletAccount.upsert({
          where: { user_id_currency: { user_id: userId, currency } },
          create: { user_id: userId, currency, balance: 0 },
          update: {},
        });

        const acc = await tx.walletAccount.findUnique({
          where: { user_id_currency: { user_id: userId, currency } },
          select: { id: true, balance: true, status: true },
        });

        if (!acc) {
          throw new Error("Wallet account not found");
        }

        if (String(acc.status ?? "active") === "blocked") {
          throw new Error("Wallet blocked");
        }

        return {
          id: acc.id,
          balance: Number(acc.balance ?? 0),
        };
      };

      const applyWalletTx = async ({ userId, type, amount, description }) => {
        const already = await tx.walletTransaction.findFirst({
          where: {
            stripe_payment_intent_id: stripePaymentIntentId,
            id_reserva,
            type,
          },
          select: { id: true },
        });
        if (already) {
          return;
        }

        const acc = await ensureWalletAccount(userId);
        const balanceBefore = Number(acc.balance ?? 0);

        const updated = await tx.walletAccount.update({
          where: { id: acc.id },
          data: { balance: { increment: amount } },
          select: { balance: true },
        });

        const balanceAfter = Number(updated.balance ?? balanceBefore + amount);

        await tx.walletTransaction.create({
          data: {
            wallet_account_id: acc.id,
            user_id: userId,
            currency,
            id_reserva,
            type,
            amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            description,
            stripe_payment_intent_id: stripePaymentIntentId,
          },
        });
      };

      const baseDesc = paymentDescription
        ? `Reserva: ${paymentDescription}`
        : "Reserva";

      await applyWalletTx({
        userId: payerUserId,
        type: "reservation_payment",
        amount: -grossAmountCents,
        description: `${baseDesc} (pago)`,
      });

      await applyWalletTx({
        userId: receiverUserId,
        type: "reservation_revenue",
        amount: netAmountCents,
        description: `${baseDesc} (ingreso)`,
      });

      await applyWalletTx({
        userId: platformUserId,
        type: "commision",
        amount: commissionAmountCents,
        description: `${baseDesc} (comisión 15%)`,
      });
    });
  } catch (error) {
    throw error;
  }
}
async function handlePaymentIntentFailed(jsonData) {
  const paymentIntent = jsonData.object;

  await prisma.reserva.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: {
      status: status[3],
      stripe_payment_intent_status: paymentIntent.status,
    },
  });

  await prisma.walletRecharge.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: { status: status[3], stripe_payment_status: paymentIntent.status },
  });

  await prisma.walletTransaction.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: { status: status[3], stripe_payment_status: paymentIntent.status },
  });
}
async function handlePaymentIntentCanceled(jsonData) {
  const paymentIntent = jsonData.object;

  await prisma.paymentIntent.update({
    where: { stripe_payment_id: paymentIntent.id },
    data: { state: paymentIntent.status },
  });

  await prisma.reserva.updateMany({
    where: { stripe_payment_intent_id: paymentIntent.id },
    data: {
      status: status[4],
      stripe_payment_intent_status: paymentIntent.status,
    },
  });
}
async function handleCustomerUpdated(jsonData) {
  const customer = jsonData.object;
  const userId =
    customer?.metadata?.userId ??
    customer?.metadata?.user_id ??
    customer?.metadata?.id_user ??
    null;
  if (!userId) {
    return;
  }
  try {
    await prisma.user.update({
      where: { id: String(userId) },
      data: { stripe_customer_account: customer.id },
    });
  } catch (_e) {
    return;
  }
}
async function handleCustomerCreated(jsonData) {
  const customer = jsonData.object;
  const userId =
    customer?.metadata?.userId ??
    customer?.metadata?.user_id ??
    customer?.metadata?.id_user ??
    null;
  if (!userId) {
    return;
  }
  try {
    await prisma.user.update({
      where: { id: String(userId) },
      data: { stripe_customer_account: customer.id },
    });
  } catch (_e) {
    return;
  }
}
async function handleCheckoutSessionUpdated(jsonData) {}
async function handleCheckoutSessionCompleted(stripeEvent) {
  const sessionFromEvent = stripeEvent?.data?.object;
  if (!sessionFromEvent) {
    return;
  }

  let checkout_session = sessionFromEvent;
  try {
    checkout_session = await stripe.checkout.sessions.retrieve(
      sessionFromEvent.id,
      {
        expand: ["payment_intent"],
      },
    );
  } catch (_) {}

  const type =
    checkout_session?.metadata?.type ?? checkout_session?.metadata?.typo;
  let paymentIntent = checkout_session.payment_intent;
  if (type === "recharge") {
    return;
  }

  if (type === "reserva") {
    const id_user = checkout_session?.metadata?.id_user ?? null;
    const id_reserva = checkout_session?.metadata?.id_reserva ?? null;
    const trayectoIdRaw = checkout_session?.metadata?.id_trayecto;
    const trayectoId = trayectoIdRaw != null ? Number(trayectoIdRaw) : null;

    if (!id_user || !Number.isFinite(trayectoId)) {
      return;
    }

    const paymentIntentId =
      (typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id) ??
      null;

    const runNoTx = async () => {
      const userExists = await prisma.user.findUnique({
        where: { id: String(id_user) },
        select: { id: true },
      });
      if (!userExists) return;

      const trayectoExists = await prisma.trayecto.findUnique({
        where: { id: trayectoId },
        select: { id: true },
      });
      if (!trayectoExists) return;

      const existingReserva = await prisma.reserva.findUnique({
        where: { id_reserva },
        select: { id_reserva: true },
      });
      if (!existingReserva) return;

      const trayecto = await prisma.trayecto.findUnique({
        where: { id: trayectoId },
        select: { disponible: true },
      });
      const disponible = Number(trayecto?.disponible ?? 0);
      if (!Number.isFinite(disponible) || disponible <= 0) return;

      const updated = await prisma.trayecto.updateMany({
        where: { id: trayectoId, disponible: { gt: 0 } },
        data: { disponible: { decrement: 1 } },
      });
      if (updated.count === 0) return;

      await prisma.reserva.update({
        where: { id_reserva },
        data: { status: status[8] },
      });

      if (paymentIntentId) {
        const reserva = await prisma.reserva.findUnique({
          where: { id_reserva },
          select: { stripe_payment_intent_id: true },
        });
        if (
          reserva &&
          (!reserva.stripe_payment_intent_id ||
            reserva.stripe_payment_intent_id === paymentIntentId)
        ) {
          await prisma.reserva.update({
            where: { id_reserva },
            data: { stripe_payment_intent_id: paymentIntentId },
          });
        }
      }
    };

    try {
      await prisma.$transaction(async (tx) => {
        const userExists = await tx.user.findUnique({
          where: { id: String(id_user) },
          select: { id: true },
        });
        if (!userExists) return;

        const trayectoExists = await tx.trayecto.findUnique({
          where: { id: trayectoId },
          select: { id: true },
        });
        if (!trayectoExists) return;

        const existingReserva = await tx.reserva.findUnique({
          where: { id_reserva },
          select: { id_reserva: true },
        });
        if (!existingReserva) return;

        const trayecto = await tx.trayecto.findUnique({
          where: { id: trayectoId },
          select: { disponible: true },
        });
        const disponible = Number(trayecto?.disponible ?? 0);
        if (!Number.isFinite(disponible) || disponible <= 0) return;

        const updated = await tx.trayecto.updateMany({
          where: { id: trayectoId, disponible: { gt: 0 } },
          data: { disponible: { decrement: 1 } },
        });
        if (updated.count === 0) return;

        await tx.reserva.update({
          where: { id_reserva },
          data: { status: status[8] },
        });

        if (paymentIntentId) {
          const reserva = await tx.reserva.findUnique({
            where: { id_reserva },
            select: { stripe_payment_intent_id: true },
          });
          if (
            reserva &&
            (!reserva.stripe_payment_intent_id ||
              reserva.stripe_payment_intent_id === paymentIntentId)
          ) {
            await tx.reserva.update({
              where: { id_reserva },
              data: { stripe_payment_intent_id: paymentIntentId },
            });
          }
        }
      });
    } catch (error) {
      const msg = String(error?.message ?? "");
      if (msg.includes("HTTP status 404")) {
        await runNoTx();
        return;
      }
      throw error;
    }

    return;
  }
}

async function handleCheckoutSessionExpired(jsonData) {
  const checkout_session = jsonData.object;
  const reserva = await prisma.reserva.findFirst({
    where: { stripe_checkout_session_id: checkout_session.id },
    select: { id_reserva: true, id_trayecto: true },
  });
  if (!reserva) {
    return;
  }

  await prisma.reserva.delete({
    where: { id_reserva: reserva.id_reserva },
  });

  const trayecto = await prisma.trayecto.findUnique({
    where: { id: reserva.id_trayecto },
    select: { disponible: true },
  });
  if (trayecto) {
    await prisma.trayecto.update({
      where: { id: reserva.id_trayecto },
      data: { disponible: (trayecto.disponible ?? 0) + 1 },
    });
  }
}
async function handleAccountUpdated(jsonData) {
  const stripeAccount = jsonData?.object;
  if (!stripeAccount?.id) {
    return;
  }

  const stripeAccountId = stripeAccount.id;
  const userIdRaw =
    stripeAccount?.metadata?.userId ??
    stripeAccount?.metadata?.user_id ??
    stripeAccount?.metadata?.id_user ??
    null;
  let userId = userIdRaw ? String(userIdRaw) : null;

  const chargesEnabled = Boolean(stripeAccount.charges_enabled);
  const transfersEnabled =
    String(stripeAccount?.capabilities?.transfers ?? "").toLowerCase() ===
    "active";
  const detailsSubmitted = Boolean(stripeAccount.details_submitted);

  const onboardingComplete = detailsSubmitted;

  try {
    await prisma.$transaction(async (tx) => {
      if (!userId) {
        const userByAccount = await tx.user.findFirst({
          where: { stripe_account: stripeAccountId },
          select: { id: true },
        });
        if (userByAccount) {
          userId = userByAccount.id;
        }
      }

      if (!userId) {
        return;
      }

      const userRow = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, stripe_customer_account: true },
      });
      if (!userRow) {
        return;
      }

      let stripeCustomerAccountId = userRow.stripe_customer_account ?? null;

      if (
        !stripeCustomerAccountId &&
        typeof userRow.name === "string" &&
        typeof userRow.email === "string"
      ) {
        const customer_account = await stripe.customers.create({
          name: userRow.name,
          individual_name: userRow.name,
          email: userRow.email,
        });
        stripeCustomerAccountId = customer_account.id;
        await tx.user.update({
          where: { id: userId },
          data: { stripe_customer_account: stripeCustomerAccountId },
        });
      }

      await tx.account.upsert({
        where: { stripe_account_id: stripeAccountId },
        create: {
          stripe_account_id: stripeAccountId,
          user_id: userId,
          charges_enabled: chargesEnabled,
          transfers_enabled: transfersEnabled,
          details_submitted: detailsSubmitted,
        },
        update: {
          user_id: userId,
          charges_enabled: chargesEnabled,
          transfers_enabled: transfersEnabled,
          details_submitted: detailsSubmitted,
        },
      });

      if (onboardingComplete) {
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { stripe_account: true },
        });
        if (
          currentUser &&
          (!currentUser.stripe_account ||
            currentUser.stripe_account === stripeAccountId)
        ) {
          await tx.user.update({
            where: { id: userId },
            data: { stripe_account: stripeAccountId, onboarding_ended: true },
          });
        } else {
          await tx.user.update({
            where: { id: userId },
            data: { onboarding_ended: true },
          });
        }
      } else {
        await tx.user.updateMany({
          where: { id: userId, onboarding_ended: { not: true } },
          data: { onboarding_ended: false },
        });
      }
    });
  } catch (error) {
    console.error("handleAccountUpdated error:", error);
    throw error;
  }
}

export const methods = {
  createEvent,
};
