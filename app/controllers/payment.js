import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { trayectosService } from "../services/trayectosService.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import parseUTCDate from "../utils/parseUTCDate.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    total_eur: totalCents / 100,
    net_price_eur: netPriceCents / 100,
    driver_price_eur: driverPriceCents / 100,
    application_fee_eur: applicationFeeCents / 100,
    platform_fee_eur: platformFeeCents / 100,
    stripe_fee_eur: stripeFeeCents / 100,
  };
}

const createSession = catchAsync(async (req, res, next) => {
  const { amount, description, success_url, cancel_url } = req.body;

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          product_data: {
            name: "Trayecto",

            description: description,
          },

          currency: "usd",
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: success_url,
    cancel_url: cancel_url,
  });
  return res.json(session);
});

const rechargeWalletUser = catchAsync(async (req, res, next) => {
  const { amount, description, success_url, cancel_url } = req.body;
  const user = req.user;
  const destination = user.stripe_account;

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          product_data: {
            name: "Recarga de tu monedero virtual",
            description: description,
          },
          currency: "eur",
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      transfer_data: {
        destination: destination,
      },
      metadata: {
        userId: String(user.id),
        type: "recharge",
        typo: "recharge",
        description: String(description ?? ""),
      },
    },
    metadata: {
      userId: user.id,
      type: "recharge",
      typo: "recharge",
      description: description,
    },
    mode: "payment",
    success_url: success_url,
    cancel_url: cancel_url,
  });

  return res.json(session);
});

const createCheckoutPaymentIntent = catchAsync(async (req, res, next) => {
  const { amount, id_reserva, description, recipient_user_id } = req.body;
  const user = req.user;

  const trayectoIdRaw =
    req.body?.id_trayecto ?? req.body?.trayectoId ?? req.body?.trayecto_id;
  const trayectoId = trayectoIdRaw != null ? String(trayectoIdRaw) : null;
  if (!trayectoId) {
    return next(
      new AppError("Missing or invalid id_trayecto", 400, "VALIDATION_ERROR"),
    );
  }

  if (!recipient_user_id) {
    return next(
      new AppError("Missing recipient_user_id", 400, "VALIDATION_ERROR"),
    );
  }

  if (!amount || amount <= 0) {
    return next(
      new AppError("Missing or invalid amount", 400, "VALIDATION_ERROR"),
    );
  }

  const sender = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_customer_account: true, stripe_account: true },
  });

  if (!sender) {
    return next(new AppError("Sender user not found", 404, "USER_NOT_FOUND"));
  }

  if (!sender.stripe_customer_account) {
    return next(
      new AppError(
        "Sender does not have a Stripe customer account",
        400,
        "STRIPE_CUSTOMER_MISSING",
      ),
    );
  }

  const recipient = await prisma.user.findUnique({
    where: { id: String(recipient_user_id) },
    select: { stripe_account: true, name: true },
  });

  if (!recipient) {
    return next(
      new AppError("Recipient user not found", 404, "USER_NOT_FOUND"),
    );
  }

  if (!recipient.stripe_account) {
    return next(
      new AppError(
        "Recipient does not have a Stripe Connect account",
        400,
        "STRIPE_CONNECT_MISSING",
      ),
    );
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
    return next(
      new AppError(
        "Recipient has not completed Stripe onboarding or transfers are not enabled. The recipient must complete onboarding before receiving payments.",
        400,
        "STRIPE_ONBOARDING_INCOMPLETE",
      ),
    );
  }

  const myOrigin = (process.env.MY_ORIGIN || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const deepLink = req.body?.return_url || "youconnext://perfil";
  const successUrl =
    req.body?.success_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;
  const cancelUrl =
    req.body?.cancel_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;

  const pricing = calculateTotalPrice(amount);

  const checkout_session = await stripe.checkout.sessions.create({
    customer: sender.stripe_customer_account,
    line_items: [
      {
        price_data: {
          currency: "eur",
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
      metadata: {
        type: "reserva",
        id_user: String(user.id),
        id_reserva: String(id_reserva || ""),
        sender_account: String(sender.stripe_account ?? ""),
        destination_account: String(recipient.stripe_account),
        id_trayecto: trayectoId,
        recipient_user_id: String(recipient_user_id),
        net_price_cents: String(pricing.net_price_cents),
        driver_price_cents: String(pricing.driver_price_cents),
        total_cents: String(pricing.total_cents),
        application_fee_cents: String(pricing.application_fee_cents),
        platform_fee_cents: String(pricing.platform_fee_cents),
        stripe_fee_cents: String(pricing.stripe_fee_cents),
      },
    },
    metadata: {
      type: "reserva",
      id_user: user.id,
      id_reserva: id_reserva || "",
      sender_account: sender.stripe_account ?? "",
      destination_account: recipient.stripe_account,
      id_trayecto: trayectoId,
      recipient_user_id: String(recipient_user_id),
      net_price_cents: String(pricing.net_price_cents),
      driver_price_cents: String(pricing.driver_price_cents),
      total_cents: String(pricing.total_cents),
      application_fee_cents: String(pricing.application_fee_cents),
      platform_fee_cents: String(pricing.platform_fee_cents),
      stripe_fee_cents: String(pricing.stripe_fee_cents),
    },
    submit_type: "pay",
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return res.status(200).send({
    ...checkout_session,
    pricing,
  });
});

const resumeCheckoutPaymentIntent = catchAsync(async (req, res, next) => {
  const { id_reserva } = req.body;
  const user = req.user;

  if (!id_reserva) {
    return next(new AppError("Missing id_reserva", 400, "VALIDATION_ERROR"));
  }

  const dbPaymentIntent = await prisma.paymentIntent.findFirst({
    where: { id_reserva: String(id_reserva) },
    orderBy: { created_at: "desc" },
  });

  if (!dbPaymentIntent) {
    return next(
      new AppError(
        "No payment intent found for this reservation",
        404,
        "PAYMENT_INTENT_NOT_FOUND",
      ),
    );
  }

  const paymentIntentId = dbPaymentIntent.stripe_payment_id;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    return next(
      new AppError(
        "Payment intent not found in Stripe",
        404,
        "PAYMENT_INTENT_NOT_FOUND",
      ),
    );
  }

  const piStatus = String(paymentIntent.status);
  if (piStatus === "succeeded" || piStatus === "canceled") {
    return next(
      new AppError(
        `Payment intent is already ${piStatus}`,
        409,
        "PAYMENT_INTENT_ALREADY_COMPLETED",
      ),
    );
  }

  const sender = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_customer_account: true, stripe_account: true },
  });

  if (!sender?.stripe_customer_account) {
    return next(
      new AppError(
        "Sender does not have a Stripe customer account",
        400,
        "STRIPE_CUSTOMER_MISSING",
      ),
    );
  }

  const destinationAccount =
    paymentIntent?.metadata?.destination_account ||
    dbPaymentIntent?.destination_account ||
    null;
  if (!destinationAccount) {
    return next(
      new AppError(
        "Cannot determine destination account from original payment",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const recipient = await prisma.user.findFirst({
    where: { stripe_account: destinationAccount },
    select: { name: true },
  });

  const myOrigin = (process.env.MY_ORIGIN || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const deepLink = req.body?.return_url || "youconnext://perfil";
  const successUrl =
    req.body?.success_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;
  const cancelUrl =
    req.body?.cancel_url ||
    `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;

  const amount = paymentIntent.amount;
  const trayectoId =
    paymentIntent?.metadata?.id_trayecto ||
    dbPaymentIntent?.description ||
    null;
  const recipientUserId = paymentIntent?.metadata?.recipient_user_id || null;

  const netPriceCents = paymentIntent?.metadata?.net_price_cents
    ? parseInt(paymentIntent.metadata.net_price_cents, 10)
    : amount;
  const pricing = calculateTotalPrice(netPriceCents);

  const checkout_session = await stripe.checkout.sessions.create({
    customer: sender.stripe_customer_account,
    line_items: [
      {
        price_data: {
          currency: paymentIntent.currency || "eur",
          product_data: {
            name: "Reserva de trayecto (pago pendiente)",
            description:
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
      metadata: {
        type: "reserva",
        id_user: String(user.id),
        id_reserva: String(id_reserva),
        sender_account: String(sender.stripe_account ?? ""),
        destination_account: String(destinationAccount),
        id_trayecto: String(trayectoId ?? ""),
        recipient_user_id: String(recipientUserId ?? ""),
        net_price_cents: String(pricing.net_price_cents),
        driver_price_cents: String(pricing.driver_price_cents),
        total_cents: String(pricing.total_cents),
        application_fee_cents: String(pricing.application_fee_cents),
        platform_fee_cents: String(pricing.platform_fee_cents),
        stripe_fee_cents: String(pricing.stripe_fee_cents),
      },
    },
    metadata: {
      type: "reserva",
      id_user: String(user.id),
      id_reserva: String(id_reserva),
      sender_account: sender.stripe_account ?? "",
      destination_account: String(destinationAccount),
      id_trayecto: String(trayectoId ?? ""),
      recipient_user_id: String(recipientUserId ?? ""),
      net_price_cents: String(pricing.net_price_cents),
      driver_price_cents: String(pricing.driver_price_cents),
      total_cents: String(pricing.total_cents),
      application_fee_cents: String(pricing.application_fee_cents),
      platform_fee_cents: String(pricing.platform_fee_cents),
      stripe_fee_cents: String(pricing.stripe_fee_cents),
    },
    submit_type: "pay",
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  await prisma.paymentIntent.create({
    data: {
      stripe_payment_id: checkout_session.payment_intent,
      amount: pricing.total_cents,
      currency: String(paymentIntent.currency || "eur"),
      description: dbPaymentIntent?.description ?? undefined,
      destination_account: destinationAccount,
      sender_account: sender.stripe_account ?? undefined,
      state: "pending",
      checkout_session_id: checkout_session.id,
      id_reserva: String(id_reserva),
    },
  });

  return res.status(200).send({
    status: "Success",
    message: "Checkout session created for pending payment",
    checkout_session,
    pricing,
    payment_intent_status: piStatus,
    id_reserva: String(id_reserva),
  });
});

const createStripeConnectAccount = catchAsync(async (req, res, next) => {
  const { email, country, name } = req.body;
  const user = req.user;
  const existingUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_account: true, onboarding_ended: true },
  });
  const existingStripeAccount = existingUser?.stripe_account;
  const onboardingEnded = Boolean(existingUser?.onboarding_ended);
  const normalizeOriginUrl = (originRaw) => {
    const raw = String(originRaw ?? "").trim();
    const withProto = /^https?:\/\//i.test(raw)
      ? raw
      : `${process.env.NODE_ENV === "production" ? "https" : "http"}://${raw}`;
    const url = new URL(withProto);
    url.hash = "";
    url.search = "";
    return url;
  };

  let originUrl;
  try {
    originUrl = normalizeOriginUrl(process.env.ORIGIN);
  } catch (_e) {
    return next(
      new AppError("Invalid ORIGIN URL configuration", 500, "SERVER_ERROR"),
    );
  }

  const refreshReturnUrl = originUrl.toString();
  const businessProfileUrl = new URL("/show", originUrl).toString();

  if (existingStripeAccount) {
    if (onboardingEnded) {
      return next(
        new AppError(
          "You already have an account",
          400,
          "STRIPE_ACCOUNT_EXISTS",
        ),
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: existingStripeAccount,
      refresh_url: refreshReturnUrl,
      return_url: refreshReturnUrl,
      type: "account_onboarding",
      collect: "eventually_due",
    });

    return res.status(200).send({
      status: "Success",
      message: "Stripe onboarding link created successfully",
      accountLink,
    });
  }
  const account = await stripe.accounts.create({
    type: "express",
    country: country,
    email: email,

    business_type: "individual",

    individual: {
      email: user.email,
      first_name: user.name || name.split(" ")[0] || "",
      last_name: user.surname || name.split(" ").slice(1).join(" ") || "",
    },

    metadata: {
      name: user.name,
      surname: user.surname || "",
      email: user.email,
      id: user.id,
    },
    business_profile: {
      mcc: "4121",
      name: name,
      product_description: "Usuario de la aplicación YouConnext",
      support_email: email,
      url: "https://carpooling-webapp-ten.vercel.app",
    },

    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await prisma.user.update({
    where: { id: String(user.id) },
    data: { stripe_account: account.id, onboarding_ended: false },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: refreshReturnUrl,
    return_url: refreshReturnUrl,
    type: "account_onboarding",
    collect: "eventually_due",
  });

  return res.status(200).send({
    status: "Success",
    message: "Stripe account created successfully",
    accountLink,
  });
});

async function updateStripeAccountFromProfile(userId, updates) {
  let results = { connectAccount: null, customerAccount: null };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripe_account: true,
      stripe_customer_account: true,
      email: true,
      onboarding_ended: true,
    },
  });

  if (!user) {
    console.error("[Stripe sync] Usuario no encontrado:", userId);
    return null;
  }

  // --- 1. Actualizar Stripe Customer (sin restricciones) ---
  if (user.stripe_customer_account) {
    try {
      const customerUpdate = {};
      if (updates.name) customerUpdate.name = updates.name;
      if (updates.surname)
        customerUpdate.name = [updates.name, updates.surname]
          .filter(Boolean)
          .join(" ");
      if (updates.email) customerUpdate.email = updates.email;
      if (updates.phone) customerUpdate.phone = updates.phone;

      if (Object.keys(customerUpdate).length > 0) {
        customerUpdate.metadata = {
          userId: String(userId),
          lastSyncedAt: new Date().toISOString(),
        };
        await stripe.customers.update(
          user.stripe_customer_account,
          customerUpdate,
        );
        results.customerAccount = user.stripe_customer_account;
      }
    } catch (error) {
      console.error(
        "[Stripe sync] Error actualizando Customer account:",
        error?.message ?? error,
      );
    }
  }

  // --- 2. Actualizar Stripe Connect Account ---
  if (!user.stripe_account) return results;

  const businessProfile = {
    mcc: "4121",
    product_description: "Conductor de carpooling en la plataforma YouConnext",
    url: "https://carpooling-webapp-ten.vercel.app",
  };

  const individualUpdate = {};

  if (updates.name) {
    individualUpdate.first_name = updates.name;
    businessProfile.name = updates.name;
  }

  if (updates.surname) {
    individualUpdate.last_name = updates.surname;
  }

  if (updates.email) {
    individualUpdate.email = updates.email;
    businessProfile.support_email = updates.email;
  }

  if (updates.phone) {
    individualUpdate.phone = updates.phone;
  }

  if (updates.direccion) {
    individualUpdate.address = {
      line1: updates.direccion,
      ...(updates.codigo_postal ? { postal_code: updates.codigo_postal } : {}),
      ...(updates.ciudad ? { city: updates.ciudad } : {}),
      ...(updates.provincia ? { state: updates.provincia } : {}),
      country: "ES",
    };
  }

  if (updates.fecha_nacimiento) {
    const dob = parseUTCDate(updates.fecha_nacimiento);
    if (!isNaN(dob.getTime())) {
      individualUpdate.dob = {
        day: dob.getDate(),
        month: dob.getMonth() + 1,
        year: dob.getFullYear(),
      };
    }
  }

  if (updates.genero) {
    const generoMap = {
      Masculino: "male",
      Femenino: "female",
    };
    if (generoMap[updates.genero]) {
      individualUpdate.gender = generoMap[updates.genero];
    }
  }

  const hasBusinessProfile = Object.keys(businessProfile).length > 3; // mcc, product_description, url always present
  const hasIndividual = Object.keys(individualUpdate).length > 0;

  if (!hasBusinessProfile && !hasIndividual) return results;

  // Campos que SIEMPRE se pueden actualizar (incluso post-onboarding)
  const safeUpdate = {};
  if (hasBusinessProfile) safeUpdate.business_profile = businessProfile;
  if (updates.email) safeUpdate.email = updates.email;

  // Campos que SOLO se pueden actualizar ANTES del onboarding
  // Para Express accounts, una vez creado un Account Link, individual queda bloqueado
  const onboardingCompleted = Boolean(user.onboarding_ended);

  try {
    if (hasIndividual && !onboardingCompleted) {
      // Pre-onboarding: podemos actualizar individual + business_profile + email
      const fullUpdate = { ...safeUpdate };
      fullUpdate.individual = individualUpdate;
      const account = await stripe.accounts.update(
        user.stripe_account,
        fullUpdate,
      );
      results.connectAccount = account.id;

      await prisma.account.update({
        where: { stripe_account_id: user.stripe_account },
        data: {
          charges_enabled: account.charges_enabled ?? false,
          transfers_enabled:
            String(account.capabilities?.transfers ?? "").toLowerCase() ===
            "active",
          details_submitted: account.details_submitted ?? false,
        },
      });
    } else if (hasIndividual && onboardingCompleted) {
      // Post-onboarding: individual está bloqueado, pero business_profile y email sí se pueden actualizar
      console.warn(
        "[Stripe sync] Onboarding ya completado. Los campos individuales (nombre, DNI, dirección, etc.) no se pueden actualizar en Stripe Connect. Solo se actualiza business_profile y email.",
      );
      if (Object.keys(safeUpdate).length > 0) {
        const account = await stripe.accounts.update(
          user.stripe_account,
          safeUpdate,
        );
        results.connectAccount = account.id;

        await prisma.account.update({
          where: { stripe_account_id: user.stripe_account },
          data: {
            charges_enabled: account.charges_enabled ?? false,
            transfers_enabled:
              String(account.capabilities?.transfers ?? "").toLowerCase() ===
              "active",
            details_submitted: account.details_submitted ?? false,
          },
        });
      }
    } else {
      // Solo business_profile y/o email
      if (Object.keys(safeUpdate).length > 0) {
        const account = await stripe.accounts.update(
          user.stripe_account,
          safeUpdate,
        );
        results.connectAccount = account.id;

        await prisma.account.update({
          where: { stripe_account_id: user.stripe_account },
          data: {
            charges_enabled: account.charges_enabled ?? false,
            transfers_enabled:
              String(account.capabilities?.transfers ?? "").toLowerCase() ===
              "active",
            details_submitted: account.details_submitted ?? false,
          },
        });
      }
    }
  } catch (error) {
    // Si falla por restricciones post-onboarding, intentar solo con safeUpdate
    if (
      error.code === "invalid_request_error" &&
      hasIndividual &&
      onboardingCompleted &&
      Object.keys(safeUpdate).length > 0
    ) {
      try {
        const account = await stripe.accounts.update(
          user.stripe_account,
          safeUpdate,
        );
        results.connectAccount = account.id;
      } catch (retryError) {
        console.error(
          "[Stripe sync] Error actualizando Connect account (retry):",
          retryError?.message ?? retryError,
        );
      }
    } else {
      console.error(
        "[Stripe sync] Error actualizando Connect account:",
        error?.message ?? error,
      );
    }
  }

  return results;
}

async function createStripeAccountForUserEmpty(
  userId,
  email,
  name = "",
  surname = "",
) {
  try {
    const nameParts = name.trim().split(/\s+/);
    const account = await stripe.accounts.create({
      type: "express",
      country: "ES",
      email,
      business_type: "individual",
      individual: {
        ...(nameParts[0] ? { first_name: nameParts[0] } : {}),
        ...(surname || nameParts.slice(1).join(" ")
          ? { last_name: surname || nameParts.slice(1).join(" ") }
          : {}),
      },
      business_profile: {
        mcc: "4121",
        product_description:
          "Conductor de carpooling en la plataforma YouConnext",
        url: "https://carpooling-webapp-ten.vercel.app",
      },
      metadata: { userId },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    await prisma.account.create({
      data: {
        stripe_account_id: account.id,
        user_id: userId,
        charges_enabled: account.charges_enabled ?? false,
        transfers_enabled:
          String(account.capabilities?.transfers ?? "").toLowerCase() ===
          "active",
        details_submitted: account.details_submitted ?? false,
      },
    });

    return account.id;
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    return null;
  }
}

const getMyStripeConnectAccount = catchAsync(async (req, res, next) => {
  const user = req.user;
  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_account: true },
  });
  if (!dbUser?.stripe_account) {
    return next(
      new AppError("You dont have an account", 404, "STRIPE_ACCOUNT_NOT_FOUND"),
    );
  }
  const stripe_account_id = dbUser.stripe_account;
  const account = await stripe.accounts.retrieve(stripe_account_id);
  return res.status(200).send({
    status: "Success",
    message: "Stripe account created successfully",
    account,
  });
});

const createStripeCustomer = catchAsync(async (req, res, next) => {
  const { email, name } = req.body;
  const user = req.user;
  if (user.stripe_customer_account) {
    return next(
      new AppError(
        "You already have an account",
        400,
        "STRIPE_CUSTOMER_EXISTS",
      ),
    );
  }
  const customer = await stripe.customers.create({
    email: email,
    name: name,
    metadata: {
      userId: String(user.id),
    },
  });

  await prisma.user.update({
    where: { id: String(user.id) },
    data: { stripe_customer_account: customer.id },
  });

  return res.status(200).send({
    status: "Success",
    message: "Stripe customer created successfully",
    customer,
  });
});
const createLoginLink = catchAsync(async (req, res, next) => {
  const return_url = req.body?.return_url ?? null;
  const refresh_url = req.body?.refresh_url ?? null;

  const user = req.user;
  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_account: true, onboarding_ended: true },
  });
  if (!dbUser?.stripe_account) {
    return next(
      new AppError("You dont have an account", 404, "STRIPE_ACCOUNT_NOT_FOUND"),
    );
  }

  if (!dbUser.onboarding_ended) {
    return next(
      new AppError(
        "Onboarding not completed. Use POST /api/payment/stripe-connect-link to complete onboarding first.",
        400,
        "STRIPE_ONBOARDING_INCOMPLETE",
      ),
    );
  }

  const loginLink = await stripe.accounts.createLoginLink(
    dbUser.stripe_account,
  );
  return res.status(200).send({
    status: "Success",
    message: "Stripe login link created successfully",
    loginLink,
  });
});

const createPaymentIntent = catchAsync(async (req, res, next) => {
  const { amount, currency, destination } = req.body;
  const pricing = calculateTotalPrice(amount);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: pricing.total_cents,
    currency: currency,
    metadata: {
      userId: String(req.user.id),
      net_price_cents: String(pricing.net_price_cents),
      driver_price_cents: String(pricing.driver_price_cents),
      total_cents: String(pricing.total_cents),
      application_fee_cents: String(pricing.application_fee_cents),
      platform_fee_cents: String(pricing.platform_fee_cents),
      stripe_fee_cents: String(pricing.stripe_fee_cents),
    },
    customer: req.user.stripe_customer_account,
    capture_method: "manual",
    application_fee_amount: pricing.application_fee_cents,
    transfer_data: {
      destination: destination,
    },
  });
  return res.status(200).send({
    status: "Success",
    message: "Stripe payment intent created successfully",
    paymentIntent,
    pricing,
  });
});
const getMyStripeCustomerAccount = catchAsync(async (req, res, next) => {
  const user = req.user;
  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_customer_account: true },
  });

  if (!dbUser?.stripe_customer_account) {
    return next(
      new AppError(
        "You dont have an account",
        404,
        "STRIPE_CUSTOMER_NOT_FOUND",
      ),
    );
  }
  const customer = await stripe.customers.retrieve(
    dbUser.stripe_customer_account,
  );

  return res.status(200).send({
    status: "Success",
    message: "Stripe customer created successfully",
    customer,
  });
});

const createStripeLinkAccount = catchAsync(async (req, res, next) => {
  const user = req.user;
  if (!user?.stripe_account) {
    return next(
      new AppError("You dont have an account", 404, "STRIPE_ACCOUNT_NOT_FOUND"),
    );
  }

  const return_url = req.body?.return_url ?? process.env.ORIGIN;
  const refresh_url = req.body?.refresh_url ?? process.env.ORIGIN;
  if (!return_url || !refresh_url) {
    return next(
      new AppError(
        "return_url or refresh_url is required",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const accountLink = await stripe.accountLinks.create({
    account: user.stripe_account,
    refresh_url,
    return_url,
    type: "account_onboarding",
    collect: "eventually_due",
  });
  return res.status(200).send({
    status: "Success",
    message: "Stripe account link created successfully",
    accountLink,
  });
});

const createStripeTransfer = catchAsync(async (req, res, next) => {
  const { amount, currency, destination } = req.body;
  const transfer = await stripe.transfers.create({
    amount: amount,
    currency: currency,
    destination: destination,
    metadata: {
      userId: String(req.user.id),
    },
  });
  return res.status(200).send({
    status: "Success",
    message: "Stripe transfer created successfully",
    transfer,
  });
});

const createBillingPortal = catchAsync(async (req, res, next) => {
  const user = req.user;
  const billingPortal = await stripe.billingPortal.sessions.create({
    customer: req.user.stripe_customer_account,
    return_url: process.env.ORIGIN,
  });
  return res.status(200).send({
    status: "Success",
    message: "Stripe billing portal created successfully",
    billingPortal,
  });
});

const getCashBalance = catchAsync(async (req, res, next) => {
  let stripe_account = req.user.stripe_account;
  if (!stripe_account) {
    return next(
      new AppError("You dont have an account", 404, "STRIPE_ACCOUNT_NOT_FOUND"),
    );
  }
  const cashBalance = await stripe.balance.retrieve({
    stripeAccount: stripe_account,
  });
  const availableEuros = cashBalance.available.find(
    (b) => b.currency === "eur",
  );
  const pendingEuros = cashBalance.pending.find((b) => b.currency === "eur");

  const availableAmount = availableEuros
    ? (availableEuros.amount / 100).toFixed(2)
    : "0.00";
  const pendingAmount = pendingEuros
    ? (pendingEuros.amount / 100).toFixed(2)
    : "0.00";
  return res.status(200).send({
    status: "Success",
    message: "Cash balance retrieved successfully",
    cashBalance,
    availableAmount,
    pendingAmount,
  });
});

const getWalletBalance = catchAsync(async (req, res, next) => {
  const user = req.user;

  const bearerToken = req.headers.authorization?.split(" ")[1];
  const cookieToken = req.cookies?.access_token;
  const userToken = bearerToken || cookieToken;

  const walletAccounts = await prisma.walletAccount.findMany({
    where: { user_id: String(user.id) },
    orderBy: { currency: "asc" },
    select: { currency: true, balance: true },
  });

  let balances;
  if (walletAccounts.length > 0) {
    balances = walletAccounts.map((r) => ({
      currency: r.currency,
      balance_cents: Number(r.balance ?? 0),
    }));
  } else {
    const recharges = await prisma.walletRecharge.groupBy({
      by: ["currency"],
      where: { user_id: String(user.id), status: "succeeded" },
      _sum: { amount: true },
    });

    balances = recharges.map((r) => ({
      currency: r.currency,
      balance_cents: Number(r._sum.amount ?? 0),
    }));
  }

  let caeBalance = null;
  if (userToken) {
    caeBalance = await trayectosService.getCAEBalance(userToken);
  }

  return res.status(200).send({
    status: "Success",
    balances,
    cae: caeBalance,
  });
});

const getWalletTransactions = catchAsync(async (req, res, next) => {
  const user = req.user;
  const limitRaw = req.query?.limit;
  const offsetRaw = req.query?.offset;
  const limit = Number.isFinite(Number(limitRaw))
    ? Math.min(200, Math.max(1, Number(limitRaw)))
    : 50;
  const offset = Number.isFinite(Number(offsetRaw))
    ? Math.max(0, Number(offsetRaw))
    : 0;

  const transactions = await prisma.walletTransaction.findMany({
    where: { user_id: String(user.id) },
    orderBy: { created_at: "desc" },
    take: limit,
    skip: offset,
  });

  return res
    .status(200)
    .send({ status: "Success", transactions, limit, offset });
});

const capturePaymentIntent = catchAsync(async (req, res, next) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) {
    return next(
      new AppError("Payment intent id is required", 400, "VALIDATION_ERROR"),
    );
  }
  const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
  return res.status(200).send({
    status: "Success",
    message: "Payment intent captured successfully",
    paymentIntent,
  });
});

const captureTripPayments = catchAsync(async (req, res, next) => {
  const trayectoId =
    req.body?.id_trayecto ??
    req.body?.trayectoId ??
    req.body?.trayecto_id ??
    req.query?.id_trayecto;

  if (!trayectoId) {
    return next(new AppError("Missing id_trayecto", 400, "VALIDATION_ERROR"));
  }

  const bearerToken = req.headers.authorization?.split(" ")[1];
  const cookieToken = req.cookies?.access_token;
  const userToken = bearerToken || cookieToken;

  let reservas;
  try {
    reservas = await trayectosService.getTripPassengers(
      String(trayectoId),
      userToken,
    );
  } catch (fetchError) {
    return next(
      new AppError(
        "No se pudieron obtener las reservas del trayecto",
        502,
        "TRAYECTOS_SERVICE_UNAVAILABLE",
      ),
    );
  }

  const reservaList = Array.isArray(reservas)
    ? reservas
    : (reservas?.reservas ?? reservas?.data ?? []);

  if (!reservaList || reservaList.length === 0) {
    return res.status(200).send({
      status: "Success",
      message: "No hay reservas para este trayecto",
      captured: [],
      skipped: [],
      errors: [],
    });
  }

  const reservaIds = reservaList
    .map((r) => String(r.id_reserva ?? r.id ?? r.id ?? ""))
    .filter(Boolean);

  if (reservaIds.length === 0) {
    return res.status(200).send({
      status: "Success",
      message: "No se encontraron IDs de reserva válidos",
      captured: [],
      skipped: [],
      errors: [],
    });
  }

  const paymentIntents = await prisma.paymentIntent.findMany({
    where: {
      id_reserva: { in: reservaIds },
      state: { in: ["requires_capture", "checkout_completed"] },
    },
    select: {
      stripe_payment_id: true,
      id_reserva: true,
      amount: true,
      state: true,
    },
  });

  const captured = [];
  const skipped = [];
  const errors = [];

  for (const pi of paymentIntents) {
    try {
      const stripePI = await stripe.paymentIntents.retrieve(
        pi.stripe_payment_id,
      );

      if (stripePI.status !== "requires_capture") {
        skipped.push({
          payment_intent_id: pi.stripe_payment_id,
          id_reserva: pi.id_reserva,
          status: stripePI.status,
          reason: "not_in_requires_capture_state",
        });
        continue;
      }

      const capturedPI = await stripe.paymentIntents.capture(
        pi.stripe_payment_id,
      );

      await prisma.paymentIntent.update({
        where: { stripe_payment_id: pi.stripe_payment_id },
        data: { state: String(capturedPI.status) },
      });

      captured.push({
        payment_intent_id: pi.stripe_payment_id,
        id_reserva: pi.id_reserva,
        status: capturedPI.status,
        amount: capturedPI.amount,
      });
    } catch (captureError) {
      errors.push({
        payment_intent_id: pi.stripe_payment_id,
        id_reserva: pi.id_reserva,
        error: captureError?.message ?? String(captureError),
      });
    }
  }

  const reservasSinPI = reservaIds.filter(
    (id) => !paymentIntents.some((pi) => pi.id_reserva === id),
  );
  for (const idReserva of reservasSinPI) {
    skipped.push({
      id_reserva: idReserva,
      reason: "no_payment_intent_found",
    });
  }

  return res.status(200).send({
    status: "Success",
    message: `Capturados: ${captured.length}, Omitidos: ${skipped.length}, Errores: ${errors.length}`,
    trayecto_id: String(trayectoId),
    captured,
    skipped,
    errors,
  });
});

const cancelPaymentIntent = catchAsync(async (req, res, next) => {
  const paymentIntentId =
    req.body?.paymentIntentId ??
    req.body?.payment_intent_id ??
    req.body?.stripe_payment_intent_id;
  const cancellationReason = req.body?.cancellation_reason;

  if (!paymentIntentId) {
    return next(
      new AppError("Payment intent id is required", 400, "VALIDATION_ERROR"),
    );
  }

  let current;
  try {
    current = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    return next(
      new AppError("Payment intent not found", 404, "PAYMENT_INTENT_NOT_FOUND"),
    );
  }

  const currentStatus = String(current?.status ?? "");
  if (currentStatus === "canceled") {
    try {
      await prisma.paymentIntent.update({
        where: { stripe_payment_id: paymentIntentId },
        data: { state: "canceled" },
      });
    } catch (_) {}

    return res.status(200).send({
      status: "Success",
      message: "Payment intent already canceled",
      paymentIntent: current,
    });
  }

  if (currentStatus === "captured") {
    return next(
      new AppError(
        "El pago ha sido ya realizado y no se puede cancelar.",
        409,
        "PAYMENT_INTENT_ALREADY_COMPLETED",
      ),
    );
  }

  let canceled;
  try {
    canceled = await stripe.paymentIntents.cancel(paymentIntentId, {
      ...(cancellationReason
        ? { cancellation_reason: cancellationReason }
        : {}),
    });
  } catch (error) {
    return next(
      new AppError(
        "El pago ha sido ya realizado y no se puede cancelar.",
        400,
        "PAYMENT_CANCEL_FAILED",
      ),
    );
  }

  try {
    await prisma.paymentIntent.update({
      where: { stripe_payment_id: paymentIntentId },
      data: { state: String(canceled?.status ?? "canceled") },
    });
  } catch (_) {}

  return res.status(200).send({
    status: "Success",
    message: "Payment intent canceled successfully",
    paymentIntent: canceled,
    note: "Webhook payment_intent.canceled will confirm the final state in DB",
  });
});

const createSetupIntent = catchAsync(async (req, res, next) => {
  const { paymentIntentId } = req.body;
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["card"],
    customer: req.user.stripe_customer_account,
    metadata: {
      userId: String(req.user.id),
    },
  });
  return res.status(200).send({
    status: "Success",
    message: "Setup intent created successfully",
    setupIntent,
  });
});
const createPayout = catchAsync(async (req, res, next) => {
  const { amount, currency } = req.body;
  let payout;
  try {
    payout = await stripe.payouts.create({
      amount: amount,
      currency: currency,
      method: "standard",
      metadata: {
        userId: String(req.user.id),
      },
    });
  } catch (error) {
    if (error.code === "balance_insufficient") {
      return next(
        new AppError(
          "No tienes suficiente dinero para retirar",
          400,
          "STRIPE_BALANCE_INSUFFICIENT",
        ),
      );
    }
    return next(
      new AppError("Payout creation failed", 400, "STRIPE_PAYOUT_FAILED"),
    );
  }
  return res.status(200).send({
    status: "Success",
    message: "Payout created successfully",
    payout,
  });
});
const createBankAccount = catchAsync(async (req, res, next) => {
  const { bankAccount } = req.body;
  const bankAccountRes = await stripe.customers.createSource({
    customer: req.user.stripe_customer_account,
    source: bankAccount,
  });
  return res.status(200).send({
    status: "Success",
    message: "Bank account created successfully",
    bankAccountRes,
  });
});

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

const createWalletPayout = catchAsync(async (req, res, next) => {
  const user = req.user;
  const { amount, currency, method, idempotency_key } = req.body ?? {};

  const payoutAmount = Number(amount);
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return next(new AppError("Invalid amount", 400, "VALIDATION_ERROR"));
  }
  const payoutCurrency = String(currency ?? "eur").toLowerCase();
  const payoutMethod = method === "instant" ? "instant" : "standard";

  if (!user?.stripe_account) {
    return next(
      new AppError("You dont have an account", 404, "STRIPE_ACCOUNT_NOT_FOUND"),
    );
  }

  const idempotencyKey = String(
    idempotency_key ?? req.headers?.["idempotency-key"] ?? crypto.randomUUID(),
  );

  let walletTransactionId;
  let walletPayoutId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.walletPayout.findFirst({
        where: { idempotency_key: idempotencyKey, user_id: String(user.id) },
      });

      if (existing) {
        return { type: "idempotent", payout: existing };
      }

      await tx.walletAccount.upsert({
        where: {
          user_id_currency: {
            user_id: String(user.id),
            currency: payoutCurrency,
          },
        },
        create: {
          user_id: String(user.id),
          currency: payoutCurrency,
          balance: 0,
        },
        update: {},
      });

      const walletAccount = await tx.walletAccount.findFirst({
        where: { user_id: String(user.id), currency: payoutCurrency },
      });

      if (!walletAccount) {
        throw new AppError(
          "Wallet account not found",
          500,
          "WALLET_ACCOUNT_NOT_FOUND",
        );
      }

      if (walletAccount.status === "blocked") {
        throw new AppError("Wallet blocked", 403, "WALLET_BLOCKED");
      }

      const balanceBefore = Number(walletAccount.balance ?? 0);
      if (balanceBefore < payoutAmount) {
        throw new AppError(
          "Insufficient wallet balance",
          400,
          "INSUFFICIENT_BALANCE",
        );
      }

      const updatedAccount = await tx.walletAccount.updateMany({
        where: {
          id: walletAccount.id,
          balance: { gte: payoutAmount },
        },
        data: { balance: { decrement: payoutAmount } },
      });

      if (updatedAccount.count === 0) {
        throw new AppError(
          "Balance changed, try again",
          409,
          "WALLET_BALANCE_CHANGED",
        );
      }

      const refreshedAccount = await tx.walletAccount.findUnique({
        where: { id: walletAccount.id },
        select: { balance: true },
      });

      const balanceAfter = Number(
        refreshedAccount?.balance ?? balanceBefore - payoutAmount,
      );

      const walletTx = await tx.walletTransaction.create({
        data: {
          wallet_account_id: walletAccount.id,
          user_id: String(user.id),
          currency: payoutCurrency,
          type: "credit",
          amount: payoutAmount,
          status: "pending",
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Wallet payout (${payoutMethod})`,
        },
      });

      walletTransactionId = walletTx.id;

      const walletPayout = await tx.walletPayout.create({
        data: {
          wallet_account_id: walletAccount.id,
          wallet_transaction_id: walletTx.id,
          user_id: String(user.id),
          currency: payoutCurrency,
          amount: payoutAmount,
          status: "pending",
          method: payoutMethod,
          idempotency_key: idempotencyKey,
        },
      });

      walletPayoutId = walletPayout.id;

      return { type: "success" };
    });

    if (result.type === "idempotent") {
      return res.status(200).send({
        status: "Success",
        payout: result.payout,
        idempotency_key: idempotencyKey,
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(
      new AppError(
        error?.message ?? String(error),
        500,
        "WALLET_PAYOUT_FAILED",
      ),
    );
  }

  let stripePayout;
  try {
    stripePayout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: payoutCurrency,
        method: payoutMethod,
        metadata: {
          wallet_payout_id: String(walletPayoutId),
          user_id: String(user.id),
        },
      },
      {
        stripeAccount: user.stripe_account,
        idempotencyKey,
      },
    );
  } catch (error) {
    try {
      await prisma.$transaction(async (tx) => {
        const account = await tx.walletAccount.findFirst({
          where: { user_id: String(user.id), currency: payoutCurrency },
        });

        if (account) {
          const before = Number(account.balance ?? 0);
          const updated = await tx.walletAccount.update({
            where: { id: account.id },
            data: { balance: { increment: payoutAmount } },
          });
          const after = Number(updated.balance ?? before + payoutAmount);

          await tx.walletTransaction.create({
            data: {
              wallet_account_id: account.id,
              user_id: String(user.id),
              currency: payoutCurrency,
              type: "credit",
              amount: payoutAmount,
              status: "succeeded",
              balance_before: before,
              balance_after: after,
              description: "Payout failed refund",
            },
          });
        }

        await tx.walletTransaction.update({
          where: { id: walletTransactionId },
          data: { status: "failed" },
        });

        await tx.walletPayout.update({
          where: { id: walletPayoutId },
          data: {
            status: "failed",
            failure_reason: error?.message ?? String(error),
          },
        });
      });
    } catch (_e) {
      console.error("Refund failed:", _e);
    }

    return next(
      new AppError("Stripe payout failed", 502, "STRIPE_PAYOUT_FAILED"),
    );
  }

  const localStatus = mapStripePayoutStatusToLocalStatus(stripePayout?.status);

  await prisma.walletPayout.update({
    where: { id: walletPayoutId },
    data: {
      stripe_payout_id: stripePayout.id,
      stripe_payout_status: stripePayout.status ?? null,
      status: localStatus,
    },
  });

  const txStatus = localStatus === "succeeded" ? "succeeded" : "pending";
  await prisma.walletTransaction.update({
    where: { id: walletTransactionId },
    data: { status: txStatus },
  });

  const payoutRecord = await prisma.walletPayout.findUnique({
    where: { id: walletPayoutId },
  });

  return res.status(200).send({
    status: "Success",
    payout: payoutRecord ?? {
      id: walletPayoutId,
      stripe_payout_id: stripePayout.id,
    },
    idempotency_key: idempotencyKey,
    stripe_payout: stripePayout,
  });
});

const getWalletPayouts = catchAsync(async (req, res, next) => {
  const user = req.user;
  const limitRaw = req.query?.limit;
  const offsetRaw = req.query?.offset;
  const limit = Number.isFinite(Number(limitRaw))
    ? Math.min(200, Math.max(1, Number(limitRaw)))
    : 50;
  const offset = Number.isFinite(Number(offsetRaw))
    ? Math.max(0, Number(offsetRaw))
    : 0;

  const payouts = await prisma.walletPayout.findMany({
    where: { user_id: String(user.id) },
    orderBy: { created_at: "desc" },
    take: limit,
    skip: offset,
  });

  return res.status(200).send({ status: "Success", payouts, limit, offset });
});

const createAccountLink = catchAsync(async (req, res, next) => {
  const user = req.user;

  const deepLink = req.body?.return_url || "youconnext://perfil";
  const refreshDeepLink = req.body?.refresh_url || deepLink;

  const myOrigin = (process.env.MY_ORIGIN || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const returnUrl = `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(deepLink)}`;
  const refreshUrl = `${myOrigin}/api/payment/stripe-redirect?target=${encodeURIComponent(refreshDeepLink)}`;

  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: {
      stripe_account: true,
      onboarding_ended: true,
      email: true,
      name: true,
      surname: true,
    },
  });

  if (!dbUser) {
    return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
  }

  let stripeAccountId = dbUser.stripe_account;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "ES",
      email: dbUser.email,
      business_type: "individual",
      individual: {
        email: dbUser.email,
        first_name: dbUser.name || "",
        last_name: dbUser.surname || "",
      },
      metadata: {
        name: dbUser.name || "",
        surname: dbUser.surname || "",
        email: dbUser.email,
        id: String(user.id),
      },
      business_profile: {
        mcc: "4121",
        name:
          [dbUser.name, dbUser.surname].filter(Boolean).join(" ") ||
          dbUser.email,
        product_description: "Usuario de la aplicación YouConnext",
        support_email: dbUser.email,
        url: "https://carpooling-webapp-ten.vercel.app",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    stripeAccountId = account.id;

    await prisma.user.update({
      where: { id: String(user.id) },
      data: { stripe_account: stripeAccountId, onboarding_ended: false },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
    collect: "eventually_due",
  });

  return res.status(200).send({
    status: "Success",
    message: "Stripe onboarding link created successfully",
    accountLink,
  });
});

const stripeRedirect = catchAsync(async (req, res, next) => {
  const target = req.query?.target || "youconnext://perfil";
  const decodedTarget = decodeURIComponent(String(target));

  const safeTarget = decodedTarget.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Redirigiendo a YouConnext…</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }
    .logo { font-size: 1.8rem; font-weight: 700; margin-bottom: 1.5rem; color: #58a6ff; }
    .card {
      background: #161b22;
      border-radius: 16px;
      padding: 32px 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid #30363d;
      border-top-color: #58a6ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 0.95rem; line-height: 1.5; color: #8b949e; margin-bottom: 20px; }
    .btn {
      display: inline-block;
      background: #238636;
      color: #fff;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: #2ea043; }
    .hidden { display: none; }
    #fallback { margin-top: 16px; }
  </style>
</head>
<body>
  <div class="logo">YouConnext</div>
  <div class="card">
    <div class="spinner" id="spinner"></div>
    <p id="status">Redirigiendo a la aplicación…</p>
    <div id="fallback" class="hidden">
      <p>¿No se abrió la app automáticamente?</p>
      <a class="btn" href="${safeTarget}">Abrir YouConnext</a>
    </div>
  </div>
  <script>
    (function() {
      var target = "${safeTarget}";
      var fallback = document.getElementById("fallback");
      var spinner = document.getElementById("spinner");
      var status = document.getElementById("status");

      // Try to open the deep link
      window.location.href = target;

      // If the app didn't open after 2.5s, show the manual button
      setTimeout(function() {
        spinner.classList.add("hidden");
        status.textContent = "No se pudo abrir la app automáticamente.";
        fallback.classList.remove("hidden");
      }, 2500);
    })();
  </script>
</body>
</html>`;

  return res.status(200).type("text/html").send(html);
});

const getLinkedExternalAccounts = catchAsync(async (req, res, next) => {
  const user = req.user;

  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_account: true },
  });

  if (!dbUser?.stripe_account) {
    return next(
      new AppError(
        "El usuario no tiene cuenta de Stripe",
        404,
        "STRIPE_ACCOUNT_NOT_FOUND",
      ),
    );
  }

  const externalAccounts = await stripe.accounts.listExternalAccounts(
    dbUser.stripe_account,
    { limit: 3 },
  );

  if (externalAccounts.data.length === 0) {
    return res.status(200).send({ status: "Success", cuentas: [] });
  }

  const cuentasFormateadas = externalAccounts.data
    .map((cuenta) => {
      if (cuenta.object === "bank_account") {
        return {
          tipo: "banco",
          banco: cuenta.bank_name,
          ultimos4: cuenta.last4,
          moneda: cuenta.currency,
          estado: cuenta.status,
        };
      }
      if (cuenta.object === "card") {
        return {
          tipo: "tarjeta",
          marca: cuenta.brand,
          ultimos4: cuenta.last4,
          caducidad: `${cuenta.exp_month}/${cuenta.exp_year}`,
        };
      }
      return null;
    })
    .filter(Boolean);

  return res.status(200).send({
    status: "Success",
    cuentas: cuentasFormateadas,
  });
});

const calculatePrice = catchAsync(async (req, res, next) => {
  const { driver_price_cents } = req.body;
  if (!driver_price_cents || driver_price_cents <= 0) {
    return next(
      new AppError(
        "Missing or invalid driver_price_cents",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }
  const pricing = calculateTotalPrice(parseInt(driver_price_cents, 10));
  return res.status(200).send({ status: "Success", pricing });
});

const cotizar = catchAsync(async (req, res, next) => {
  const netoRaw = req.query?.neto;
  const neto = parseInt(netoRaw, 10);
  if (!netoRaw || isNaN(neto) || neto <= 0) {
    return next(
      new AppError(
        "Missing or invalid 'neto' query param (must be a positive number in cents)",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }
  const totalCents = Math.round(
    (neto + STRIPE_FIXED_FEE_CENTS) / (1 - STRIPE_PERCENT),
  );
  const stripeFeeCents =
    Math.round(totalCents * STRIPE_PERCENT) + STRIPE_FIXED_FEE_CENTS;
  return res.status(200).send({
    status: "Success",
    neto_cents: neto,
    total_cents: totalCents,
    stripe_fee_cents: stripeFeeCents,
    neto_eur: neto / 100,
    total_eur: totalCents / 100,
    stripe_fee_eur: stripeFeeCents / 100,
  });
});

export const methods = {
  createSession,
  createStripeConnectAccount,
  createStripeLinkAccount,
  createAccountLink,
  stripeRedirect,
  getMyStripeConnectAccount,
  createStripeCustomer,
  createStripeTransfer,
  createBillingPortal,
  getMyStripeCustomerAccount,
  createLoginLink,
  getCashBalance,
  getWalletBalance,
  getWalletTransactions,
  createPaymentIntent,
  capturePaymentIntent,
  captureTripPayments,
  cancelPaymentIntent,
  createSetupIntent,
  createPayout,
  createBankAccount,
  createWalletPayout,
  getWalletPayouts,
  createCheckoutPaymentIntent,
  resumeCheckoutPaymentIntent,
  rechargeWalletUser,
  createStripeAccountForUserEmpty,
  updateStripeAccountFromProfile,
  getLinkedExternalAccounts,
  calculatePrice,
  cotizar,
};
