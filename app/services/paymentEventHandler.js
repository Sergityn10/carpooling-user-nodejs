import Stripe from "stripe";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { eventBus } from "./eventBus.js";
import rabbitmqConsumer from "../lib/rabbitmqConsumer.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getPaymentIntentId(session) {
  if (!session.payment_intent) return null;
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent.id;
}

const STRIPE_PERCENT = parseFloat(process.env.STRIPE_FEE_PERCENT ?? "0.015");
const STRIPE_FIXED_FEE_CENTS = parseInt(
  process.env.STRIPE_FEE_FIXED_CENTS ?? "25",
  10,
);
const PLATFORM_MARGIN_PERCENT = parseFloat(
  process.env.PLATFORM_MARGIN_PERCENT ?? "0.15",
);

function calculateTotalPrice(netPriceCents) {
  const driverPriceCents = Math.round(
    netPriceCents / (1 + PLATFORM_MARGIN_PERCENT),
  );
  const totalCents = Math.round(
    (netPriceCents + STRIPE_FIXED_FEE_CENTS) / (1 - STRIPE_PERCENT),
  );
  const stripeFeeCents =
    Math.round(totalCents * STRIPE_PERCENT) + STRIPE_FIXED_FEE_CENTS;
  const applicationFeeCents = totalCents - driverPriceCents;
  const platformFeeCents = applicationFeeCents - stripeFeeCents;
  return {
    total_cents: totalCents,
    net_price_cents: netPriceCents,
    driver_price_cents: driverPriceCents,
    application_fee_cents: applicationFeeCents,
    platform_fee_cents: platformFeeCents,
    stripe_fee_cents: stripeFeeCents,
  };
}

/**
 * Handles `reserva.created.payment_required` events.
 * Creates a Stripe Checkout Session and persists the Payment Intent in DB.
 * Emits `payment.checkout.created` back so trayectos can store the checkout URL.
 */
async function handleReservaPaymentRequired(event) {
  const { data } = event;
  const { id_reserva, user_id, trayecto_id, conductor_id, payment } = data;

  if (!id_reserva || !user_id || !payment) {
    console.error(
      "[paymentEventHandler] Missing required fields in reserva.created.payment_required",
    );
    return;
  }

  const {
    amount,
    currency = "eur",
    recipient_user_id,
    description,
    success_url,
    cancel_url,
  } = payment;

  if (!amount || amount <= 0) {
    console.error(
      "[paymentEventHandler] Invalid amount for reserva",
      id_reserva,
    );
    return;
  }

  if (!recipient_user_id) {
    console.error(
      "[paymentEventHandler] Missing recipient_user_id for reserva",
      id_reserva,
    );
    return;
  }

  const sender = await prisma.user.findUnique({
    where: { id: String(user_id) },
    select: { stripe_customer_account: true, stripe_account: true },
  });

  if (!sender) {
    console.error("[paymentEventHandler] Sender user not found:", user_id);
    return;
  }

  if (!sender.stripe_customer_account) {
    console.error(
      "[paymentEventHandler] Sender has no Stripe customer account:",
      user_id,
    );
    return;
  }

  const recipient = await prisma.user.findUnique({
    where: { id: String(recipient_user_id) },
    select: { stripe_account: true, name: true },
  });

  if (!recipient) {
    console.error(
      "[paymentEventHandler] Recipient user not found:",
      recipient_user_id,
    );
    return;
  }

  if (!recipient.stripe_account) {
    console.error(
      "[paymentEventHandler] Recipient has no Stripe Connect account:",
      recipient_user_id,
    );
    return;
  }

  const recipientAccount = await prisma.account.findUnique({
    where: { stripe_account_id: recipient.stripe_account },
    select: {
      charges_enabled: true,
      transfers_enabled: true,
      details_submitted: true,
    },
  });

  if (!recipientAccount || !recipientAccount.transfers_enabled) {
    console.error(
      "[paymentEventHandler] Recipient Stripe onboarding incomplete:",
      recipient_user_id,
    );
    return;
  }

  const myOrigin = (process.env.MY_ORIGIN || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const successUrl =
    success_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent("youconnext://perfil")}`;
  const cancelUrl =
    cancel_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent("youconnext://perfil")}`;

  const pricing = calculateTotalPrice(amount);

  console.log("[paymentEventHandler] Creating payment intent for reserva", {
    id_reserva,
    user_id,
    amount,
    currency,
    recipient_user_id,
    sender_customer: sender.stripe_customer_account,
    recipient_account: recipient.stripe_account,
    pricing,
  });

  const sharedMetadata = {
    type: "reserva",
    id_user: String(user_id),
    id_reserva: String(id_reserva),
    sender_account: String(sender.stripe_account ?? ""),
    destination_account: String(recipient.stripe_account),
    id_trayecto: String(trayecto_id ?? ""),
    recipient_user_id: String(recipient_user_id),
    net_price_cents: String(pricing.net_price_cents),
    driver_price_cents: String(pricing.driver_price_cents),
    total_cents: String(pricing.total_cents),
    application_fee_cents: String(pricing.application_fee_cents),
    platform_fee_cents: String(pricing.platform_fee_cents),
    stripe_fee_cents: String(pricing.stripe_fee_cents),
  };

  const paymentIntent = await stripe.paymentIntents.create({
    amount: pricing.total_cents,
    currency,
    capture_method: "manual",
    application_fee_amount: pricing.application_fee_cents,
    transfer_data: {
      destination: recipient.stripe_account,
    },
    customer: sender.stripe_customer_account,
    metadata: sharedMetadata,
    description: description || `Pago a ${recipient.name || "conductor"}`,
  });

  const paymentIntentId = paymentIntent.id;

  console.log("[paymentEventHandler] Payment intent created", {
    id_reserva,
    payment_intent_id: paymentIntentId,
    status: paymentIntent.status,
  });

  const checkout_session = await stripe.checkout.sessions.create({
    customer: sender.stripe_customer_account,
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: "Reserva de trayecto",
            description:
              description || `Pago a ${recipient.name || "conductor"}`,
          },
          unit_amount: pricing.total_cents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: pricing.application_fee_cents,
      capture_method: "manual",
      transfer_data: {
        destination: recipient.stripe_account,
      },
      metadata: sharedMetadata,
    },
    metadata: sharedMetadata,
    submit_type: "pay",
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  console.log("[paymentEventHandler] Checkout session created", {
    id_reserva,
    checkout_session_id: checkout_session.id,
    checkout_url: checkout_session.url,
    payment_intent_id: paymentIntentId,
  });

  console.log("[paymentEventHandler] Saving payment intent to DB", {
    stripe_payment_id: paymentIntentId,
    id_reserva: String(id_reserva),
  });

  await prisma.paymentIntent.upsert({
    where: { stripe_payment_id: paymentIntentId },
    create: {
      stripe_payment_id: paymentIntentId,
      amount: pricing.total_cents,
      currency,
      description: description || undefined,
      destination_account: recipient.stripe_account,
      sender_account: sender.stripe_account ?? undefined,
      state: paymentIntent.status,
      checkout_session_id: checkout_session.id,
      id_reserva: String(id_reserva),
    },
    update: {
      amount: pricing.total_cents,
      currency,
      description: description || undefined,
      destination_account: recipient.stripe_account,
      sender_account: sender.stripe_account ?? undefined,
      state: paymentIntent.status,
      checkout_session_id: checkout_session.id,
      id_reserva: String(id_reserva),
    },
  });

  console.log("[paymentEventHandler] Payment intent saved to DB successfully");

  try {
    await eventBus.paymentIntentCreated(
      paymentIntentId,
      pricing.total_cents,
      currency,
      "pending",
      String(id_reserva),
      "pending",
    );
    console.log("[paymentEventHandler] Event payment_intent.created emitted");
  } catch (err) {
    console.error(
      "[paymentEventHandler] Failed to emit payment_intent.created:",
      err?.message ?? err,
    );
  }

  try {
    await eventBus.paymentCheckoutCreated(
      String(id_reserva),
      checkout_session.id,
      checkout_session.url,
      paymentIntentId,
      pricing.total_cents,
      currency,
      "pending",
    );
    console.log("[paymentEventHandler] Event payment.checkout.created emitted");
  } catch (err) {
    console.error(
      "[paymentEventHandler] Failed to emit payment.checkout.created:",
      err?.message ?? err,
    );
  }

  console.log(
    "[paymentEventHandler] Checkout session created for reserva",
    id_reserva,
    "→ URL:",
    checkout_session.url,
  );
}

/**
 * Handles `reserva.payment.resume` events.
 * Creates a new Stripe Checkout Session for a pending payment.
 * Emits `payment.checkout.created` back with the new checkout URL.
 */
async function handleReservaPaymentResume(event) {
  const { data } = event;
  const {
    id_reserva,
    user_id,
    trayecto_id,
    conductor_id,
    return_url,
    payment,
  } = data;

  if (!id_reserva || !user_id || !payment) {
    console.error(
      "[paymentEventHandler] Missing required fields in reserva.payment.resume",
    );
    return;
  }

  const {
    amount,
    currency = "eur",
    recipient_user_id,
    description,
    success_url,
    cancel_url,
  } = payment;

  const dbPaymentIntent = await prisma.paymentIntent.findFirst({
    where: { id_reserva: String(id_reserva) },
    orderBy: { created_at: "desc" },
  });

  if (!dbPaymentIntent) {
    console.error(
      "[paymentEventHandler] No payment intent found for reserva",
      id_reserva,
    );
    return;
  }

  const paymentIntentId = dbPaymentIntent.stripe_payment_id;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    console.error(
      "[paymentEventHandler] Payment intent not found in Stripe:",
      paymentIntentId,
    );
    return;
  }

  const piStatus = String(paymentIntent.status);
  if (piStatus === "succeeded" || piStatus === "canceled") {
    console.warn(
      "[paymentEventHandler] Payment intent already",
      piStatus,
      "for reserva",
      id_reserva,
    );
    return;
  }

  const sender = await prisma.user.findUnique({
    where: { id: String(user_id) },
    select: { stripe_customer_account: true, stripe_account: true },
  });

  if (!sender?.stripe_customer_account) {
    console.error(
      "[paymentEventHandler] Sender has no Stripe customer account:",
      user_id,
    );
    return;
  }

  const destinationAccount =
    paymentIntent?.metadata?.destination_account ||
    dbPaymentIntent?.destination_account ||
    null;

  if (!destinationAccount) {
    console.error(
      "[paymentEventHandler] Cannot determine destination account for reserva",
      id_reserva,
    );
    return;
  }

  const recipient = await prisma.user.findFirst({
    where: { stripe_account: destinationAccount },
    select: { name: true },
  });

  const myOrigin = (process.env.MY_ORIGIN || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const deepLink = return_url || "youconnext://perfil";
  const successUrl =
    success_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;
  const cancelUrl =
    cancel_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;

  const netPriceCents = amount
    ? amount
    : paymentIntent?.metadata?.net_price_cents
      ? parseInt(paymentIntent.metadata.net_price_cents, 10)
      : paymentIntent.amount;

  const pricing = calculateTotalPrice(netPriceCents);

  const sharedMetadata = {
    type: "reserva",
    id_user: String(user_id),
    id_reserva: String(id_reserva),
    sender_account: String(sender.stripe_account ?? ""),
    destination_account: String(destinationAccount),
    id_trayecto: String(trayecto_id ?? ""),
    recipient_user_id: String(recipient_user_id ?? ""),
    net_price_cents: String(pricing.net_price_cents),
    driver_price_cents: String(pricing.driver_price_cents),
    total_cents: String(pricing.total_cents),
    application_fee_cents: String(pricing.application_fee_cents),
    platform_fee_cents: String(pricing.platform_fee_cents),
    stripe_fee_cents: String(pricing.stripe_fee_cents),
  };

  const newPaymentIntent = await stripe.paymentIntents.create({
    amount: pricing.total_cents,
    currency: String(paymentIntent.currency || currency),
    capture_method: "manual",
    application_fee_amount: pricing.application_fee_cents,
    transfer_data: {
      destination: destinationAccount,
    },
    customer: sender.stripe_customer_account,
    metadata: sharedMetadata,
    description:
      dbPaymentIntent?.description ||
      paymentIntent.description ||
      `Pago a ${recipient?.name || "conductor"}`,
  });

  const newPaymentIntentId = newPaymentIntent.id;

  console.log("[paymentEventHandler] New payment intent created for resume", {
    id_reserva,
    payment_intent_id: newPaymentIntentId,
    status: newPaymentIntent.status,
  });

  const checkout_session = await stripe.checkout.sessions.create({
    customer: sender.stripe_customer_account,
    line_items: [
      {
        price_data: {
          currency: String(paymentIntent.currency || currency),
          product_data: {
            name: "Reserva de trayecto (pago pendiente)",
            description:
              description ||
              paymentIntent.description ||
              `Pago a ${recipient?.name || "conductor"}`,
          },
          unit_amount: pricing.total_cents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: pricing.application_fee_cents,
      capture_method: "manual",
      transfer_data: {
        destination: destinationAccount,
      },
      metadata: sharedMetadata,
    },
    metadata: sharedMetadata,
    submit_type: "pay",
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  await prisma.paymentIntent.upsert({
    where: { stripe_payment_id: newPaymentIntentId },
    create: {
      stripe_payment_id: newPaymentIntentId,
      amount: pricing.total_cents,
      currency: String(paymentIntent.currency || currency),
      description: dbPaymentIntent?.description ?? undefined,
      destination_account: destinationAccount,
      sender_account: sender.stripe_account ?? undefined,
      state: newPaymentIntent.status,
      checkout_session_id: checkout_session.id,
      id_reserva: String(id_reserva),
    },
    update: {
      amount: pricing.total_cents,
      currency: String(paymentIntent.currency || currency),
      description: dbPaymentIntent?.description ?? undefined,
      destination_account: destinationAccount,
      sender_account: sender.stripe_account ?? undefined,
      state: newPaymentIntent.status,
      checkout_session_id: checkout_session.id,
      id_reserva: String(id_reserva),
    },
  });

  console.log("[paymentEventHandler] Payment intent saved to DB for resume");

  try {
    await eventBus.paymentCheckoutCreated(
      String(id_reserva),
      checkout_session.id,
      checkout_session.url,
      newPaymentIntentId,
      pricing.total_cents,
      String(paymentIntent.currency || currency),
      "pending",
    );
    console.log(
      "[paymentEventHandler] Event payment.checkout.created emitted for resume",
    );
  } catch (err) {
    console.error(
      "[paymentEventHandler] Failed to emit payment.checkout.created:",
      err?.message ?? err,
    );
  }

  console.log(
    "[paymentEventHandler] Checkout session resumed for reserva",
    id_reserva,
    "→ URL:",
    checkout_session.url,
  );
}

/**
 * Initializes the RabbitMQ consumer and subscribes to trayectos events.
 */
async function start() {
  await rabbitmqConsumer.subscribe(
    "reserva.created.payment_required",
    handleReservaPaymentRequired,
  );
  await rabbitmqConsumer.subscribe(
    "reserva.payment.resume",
    handleReservaPaymentResume,
  );
  console.log("[paymentEventHandler] Subscribed to reserva events");
}

export const paymentEventHandler = { start };
