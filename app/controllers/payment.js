import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import prisma from "../lib/prisma.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createSession = async (req, res) => {
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
};

const rechargeWalletUser = async (req, res) => {
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
};

async function createCheckoutPaymentIntent(req, res) {
  try {
    const { amount, id_reserva, description, recipient_user_id } = req.body;
    const user = req.user;

    const trayectoIdRaw =
      req.body?.id_trayecto ?? req.body?.trayectoId ?? req.body?.trayecto_id;
    const trayectoId = trayectoIdRaw != null ? String(trayectoIdRaw) : null;
    if (!trayectoId) {
      return res
        .status(400)
        .send({ status: "Error", message: "Missing or invalid id_trayecto" });
    }

    if (!recipient_user_id) {
      return res
        .status(400)
        .send({ status: "Error", message: "Missing recipient_user_id" });
    }

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .send({ status: "Error", message: "Missing or invalid amount" });
    }

    const sender = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { stripe_customer_account: true, stripe_account: true },
    });

    if (!sender) {
      return res
        .status(404)
        .send({ status: "Error", message: "Sender user not found" });
    }

    if (!sender.stripe_customer_account) {
      return res.status(400).send({
        status: "Error",
        message: "Sender does not have a Stripe customer account",
      });
    }

    const recipient = await prisma.user.findUnique({
      where: { id: String(recipient_user_id) },
      select: { stripe_account: true, name: true },
    });

    if (!recipient) {
      return res
        .status(404)
        .send({ status: "Error", message: "Recipient user not found" });
    }

    if (!recipient.stripe_account) {
      return res.status(400).send({
        status: "Error",
        message: "Recipient does not have a Stripe Connect account",
      });
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
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: Math.round(amount * 0.15),
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
      },
      submit_type: "pay",
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).send(checkout_session);
  } catch (error) {
    console.error("Error creating checkout payment intent:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function resumeCheckoutPaymentIntent(req, res) {
  try {
    const { id_reserva } = req.body;
    const user = req.user;

    if (!id_reserva) {
      return res
        .status(400)
        .send({ status: "Error", message: "Missing id_reserva" });
    }

    const dbPaymentIntent = await prisma.paymentIntent.findFirst({
      where: { id_reserva: String(id_reserva) },
      orderBy: { created_at: "desc" },
    });

    if (!dbPaymentIntent) {
      return res
        .status(404)
        .send({
          status: "Error",
          message: "No payment intent found for this reservation",
        });
    }

    const paymentIntentId = dbPaymentIntent.stripe_payment_id;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return res
        .status(404)
        .send({
          status: "Error",
          message: "Payment intent not found in Stripe",
        });
    }

    const piStatus = String(paymentIntent.status);
    if (piStatus === "succeeded" || piStatus === "canceled") {
      return res.status(409).send({
        status: "Error",
        message: `Payment intent is already ${piStatus}`,
        paymentIntent,
      });
    }

    const sender = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { stripe_customer_account: true, stripe_account: true },
    });

    if (!sender?.stripe_customer_account) {
      return res.status(400).send({
        status: "Error",
        message: "Sender does not have a Stripe customer account",
      });
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

    const checkout_session = await stripe.checkout.sessions.create({
      customer: sender.stripe_customer_account,
      payment_intent: paymentIntentId,
      line_items: [
        {
          price_data: {
            currency: paymentIntent.currency || "eur",
            product_data: {
              name: "Reserva de trayecto (pago pendiente)",
              description:
                paymentIntent.description || "Pago de reserva pendiente",
            },
            unit_amount: paymentIntent.amount,
          },
          quantity: 1,
        },
      ],
      submit_type: "pay",
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).send({
      status: "Success",
      message: "Checkout session created for pending payment",
      checkout_session,
      payment_intent_status: piStatus,
      id_reserva: String(id_reserva),
    });
  } catch (error) {
    console.error("Error resuming checkout payment intent:", error);
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function createStripeConnectAccount(req, res) {
  const { email, country, name } = req.body;
  const user = req.user;
  console.log("Creando cuaenta de stripe a ", user.name);
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
    return res.status(500).send({
      status: "Error",
      message: "Invalid ORIGIN URL configuration",
    });
  }

  const refreshReturnUrl = originUrl.toString();
  const businessProfileUrl = new URL("/show", originUrl).toString();

  if (existingStripeAccount) {
    if (onboardingEnded) {
      return res
        .status(400)
        .send({ status: "Error", message: "You already have an account" });
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
  // const account = await stripe.accounts.create({
  //   type: "express",
  //   country: country,
  //   email: email,
  //   metadata: {
  //     username: user.username,
  //     email: user.email,
  //     id: user.id,
  //   },
  //   business_type: "individual",
  //   business_profile: {
  //     mcc: "5812",
  //     name: name,
  //     product_description: "Servicio de carpooling",
  //     support_email: email,
  //     url: "https://carpooling.com",
  //   },
  //   capabilities: {
  //     card_payments: {
  //       requested: true,
  //     },
  //     transfers: {
  //       requested: true,
  //     },
  //   },
  //   tos_acceptance: {
  //     service_agreement: "full",
  //   },
  // });
  const account = await stripe.accounts.create({
    type: "express",
    country: country, // Asegúrate que sea 'ES' (o el país del usuario)
    email: email,

    // 1. Esto le dice a Stripe que NO es una S.L. o Inc.
    business_type: "individual",

    // 2. Pre-llenamos datos de la persona para forzar el flujo individual
    individual: {
      email: user.email,
      first_name: name.split(" ")[0], // Asumiendo que tienes estos datos
      last_name: name.split(" ")[1],
    },

    metadata: {
      name: user.name,
      email: user.email,
      id: user.id,
    },
    business_profile: {
      mcc: "4121",

      name: name, // Nombre completo del conductor
      product_description: "Usuario de la aplicación YouConnext",
      support_email: email,
      // Si el usuario no tiene web, pon la URL de su perfil en tu app
      url: "https://carpooling-webapp-ten.vercel.app",
    },

    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },

    // 4. En cuentas Express, normalmente no necesitas forzar el TOS aquí
    // porque el usuario lo acepta en la web de Stripe.
    // Si te da error, prueba a quitar este bloque.
    /* tos_acceptance: {
      service_agreement: "full",
    }, 
    */
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
}

async function updateStripeAccountFromProfile(userId, updates) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripe_account: true, email: true },
    });
    if (!user?.stripe_account) return null;

    const businessProfile = {
      mcc: "4121",
      product_description:
        "Conductor de carpooling en la plataforma YouConnext",
      url: "https://carpooling-webapp-ten.vercel.app",
    };

    const individualUpdate = {};

    if (updates.name) {
      const nameParts = String(updates.name).trim().split(/\s+/);
      individualUpdate.first_name = nameParts[0] || undefined;
      individualUpdate.last_name = nameParts[1] || undefined;
      businessProfile.name = updates.name;
    }

    if (updates.email) {
      individualUpdate.email = updates.email;
    }

    if (updates.phone) {
      individualUpdate.phone = updates.phone;
    }

    if (updates.direccion) {
      individualUpdate.address = {
        line1: updates.direccion,
        ...(updates.codigo_postal
          ? { postal_code: updates.codigo_postal }
          : {}),
        ...(updates.ciudad ? { city: updates.ciudad } : {}),
        ...(updates.provincia ? { state: updates.provincia } : {}),
      };
    }

    if (updates.fecha_nacimiento) {
      const dob = new Date(updates.fecha_nacimiento);
      if (!isNaN(dob.getTime())) {
        individualUpdate.dob = {
          day: dob.getDate(),
          month: dob.getMonth() + 1,
          year: dob.getFullYear(),
        };
      }
    }

    const hasBusinessProfile = Object.keys(businessProfile).length > 0;
    const hasIndividual = Object.keys(individualUpdate).length > 0;

    if (!hasBusinessProfile && !hasIndividual) return null;

    let account;
    try {
      const fullUpdate = {};
      if (hasBusinessProfile) fullUpdate.business_profile = businessProfile;
      if (updates.email) fullUpdate.email = updates.email;
      if (hasIndividual) fullUpdate.individual = individualUpdate;

      account = await stripe.accounts.update(user.stripe_account, fullUpdate);
    } catch (firstError) {
      if (firstError.code === "oauth_not_supported" && hasIndividual) {
        const safeUpdate = {};
        if (hasBusinessProfile) safeUpdate.business_profile = businessProfile;
        if (updates.email) safeUpdate.email = updates.email;

        account = await stripe.accounts.update(user.stripe_account, safeUpdate);
      } else {
        throw firstError;
      }
    }

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

    return account.id;
  } catch (error) {
    console.error("Error updating Stripe account from profile:", error);
    return null;
  }
}

async function createStripeAccountForUserEmpty(userId, email, name = "") {
  try {
    const nameParts = name.trim().split(/\s+/);
    const account = await stripe.accounts.create({
      type: "express",
      country: "ES",
      email,
      business_type: "individual",
      individual: {
        ...(nameParts[0] ? { first_name: nameParts[0] } : {}),
        ...(nameParts[1] ? { last_name: nameParts[1] } : {}),
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

const getMyStripeConnectAccount = async (req, res) => {
  const user = req.user;
  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_account: true },
  });
  if (!dbUser?.stripe_account) {
    return res
      .status(404)
      .send({ status: "Error", message: "You dont have an account" });
  }
  const stripe_account_id = dbUser.stripe_account;
  const account = await stripe.accounts.retrieve(stripe_account_id);
  return res.status(200).send({
    status: "Success",
    message: "Stripe account created successfully",
    account,
  });
};

const createStripeCustomer = async (req, res) => {
  const { email, name } = req.body;
  const user = req.user;
  if (user.stripe_customer_account) {
    return res
      .status(400)
      .send({ status: "Error", message: "You already have an account" });
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
};
const createLoginLink = async (req, res) => {
  let return_url;
  let refresh_url;
  try {
    return_url = req.body.return_url ? req.body.return_url : null;
    refresh_url = req.body.refresh_url ? req.body.refresh_url : null;
  } catch (error) {
    return res.status(400).send({
      status: "Error",
      message: "return_url or refresh_url is required",
    });
  }

  const user = req.user;
  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_account: true },
  });
  if (!dbUser?.stripe_account) {
    return res
      .status(404)
      .send({ status: "Error", message: "You dont have an account" });
  }
  const loginLink = await stripe.accounts.createLoginLink(
    dbUser.stripe_account,
  );
  return res.status(200).send({
    status: "Success",
    message: "Stripe customer created successfully",
    loginLink,
  });
};

const createPaymentIntent = async (req, res) => {
  const { amount, currency, destination } = req.body;
  let applicationFeeAmount = amount * 0.1;
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: currency,
    metadata: {
      userId: String(req.user.id),
      applicationFeeAmount: applicationFeeAmount,
    },
    customer: req.user.stripe_customer_account,
    capture_method: "manual",
    application_fee_amount: applicationFeeAmount,
    transfer_data: {
      destination: destination,
    },
  });
  return res.status(200).send({
    status: "Success",
    message: "Stripe payment intent created successfully",
    paymentIntent,
  });
};
const getMyStripeCustomerAccount = async (req, res) => {
  const user = req.user;
  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { stripe_customer_account: true },
  });

  if (!dbUser?.stripe_customer_account) {
    return res
      .status(404)
      .send({ status: "Error", message: "You dont have an account" });
  }
  const customer = await stripe.customers.retrieve(
    dbUser.stripe_customer_account,
  );

  return res.status(200).send({
    status: "Success",
    message: "Stripe customer created successfully",
    customer,
  });
};

const createStripeLinkAccount = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.stripe_account) {
      return res
        .status(404)
        .send({ status: "Error", message: "You dont have an account" });
    }

    const return_url = req.body?.return_url ?? process.env.ORIGIN;
    const refresh_url = req.body?.refresh_url ?? process.env.ORIGIN;
    if (!return_url || !refresh_url) {
      return res.status(400).send({
        status: "Error",
        message: "return_url or refresh_url is required",
      });
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
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
};

const createStripeTransfer = async (req, res) => {
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
};

const createBillingPortal = async (req, res) => {
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
};

async function getCashBalance(req, res) {
  let stripe_account = req.user.stripe_account;
  if (!stripe_account) {
    return res
      .status(404)
      .send({ status: "Error", message: "You dont have an account" });
  }
  const cashBalance = await stripe.balance.retrieve({
    stripeAccount: stripe_account,
  });
  const availableEuros = cashBalance.available.find(
    (b) => b.currency === "eur",
  );
  const pendingEuros = cashBalance.pending.find((b) => b.currency === "eur");

  // Convierte de céntimos a unidad principal para la visualización
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
}

async function getWalletBalance(req, res) {
  const user = req.user;

  const walletAccounts = await prisma.walletAccount.findMany({
    where: { user_id: String(user.id) },
    orderBy: { currency: "asc" },
    select: { currency: true, balance: true },
  });

  if (walletAccounts.length > 0) {
    const balances = walletAccounts.map((r) => ({
      currency: r.currency,
      balance_cents: Number(r.balance ?? 0),
    }));
    return res.status(200).send({ status: "Success", balances });
  }

  const recharges = await prisma.walletRecharge.groupBy({
    by: ["currency"],
    where: { user_id: String(user.id), status: "succeeded" },
    _sum: { amount: true },
  });

  const balances = recharges.map((r) => ({
    currency: r.currency,
    balance_cents: Number(r._sum.amount ?? 0),
  }));

  return res.status(200).send({ status: "Success", balances });
}

async function getWalletTransactions(req, res) {
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
}

async function capturePaymentIntent(req, res) {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) {
    return res.status(400).send({
      status: "Error",
      message: "Payment intent id is required",
    });
  }
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
  } catch (error) {
    return res.status(400).send({
      status: "Error",
      message: "Payment intent captured failed",
      error,
    });
  }
  return res.status(200).send({
    status: "Success",
    message: "Payment intent captured successfully",
    paymentIntent,
  });
}

async function cancelPaymentIntent(req, res) {
  const paymentIntentId =
    req.body?.paymentIntentId ??
    req.body?.payment_intent_id ??
    req.body?.stripe_payment_intent_id;
  const cancellationReason = req.body?.cancellation_reason;

  if (!paymentIntentId) {
    return res.status(400).send({
      status: "Error",
      message: "Payment intent id is required",
    });
  }

  let current;
  try {
    current = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    return res.status(404).send({
      status: "Error",
      message: "Payment intent not found",
      error: error?.message ?? String(error),
    });
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
    return res.status(409).send({
      status: "Error",
      message: "El pago ha sido ya realizado y no se puede cancelar.",
      paymentIntent: current,
    });
  }

  let canceled;
  try {
    canceled = await stripe.paymentIntents.cancel(paymentIntentId, {
      ...(cancellationReason
        ? { cancellation_reason: cancellationReason }
        : {}),
    });
  } catch (error) {
    return res.status(400).send({
      status: "Error",
      message: "El pago ha sido ya realizado y no se puede cancelar.",
      error: error?.message ?? String(error),
    });
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
}

async function createSetupIntent(req, res) {
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
}
async function createPayout(req, res) {
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
      return res.status(400).send({
        status: "Error",
        message: "No tienes suficiente dinero para retirar",
      });
    }
    return res
      .status(400)
      .send({ status: "Error", message: "Payout creation failed", error });
  }
  return res.status(200).send({
    status: "Success",
    message: "Payout created successfully",
    payout,
  });
}
async function createBankAccount(req, res) {
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
}

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

async function createWalletPayout(req, res) {
  const user = req.user;
  const { amount, currency, method, idempotency_key } = req.body ?? {};

  const payoutAmount = Number(amount);
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return res.status(400).send({ status: "Error", message: "Invalid amount" });
  }
  const payoutCurrency = String(currency ?? "eur").toLowerCase();
  const payoutMethod = method === "instant" ? "instant" : "standard";

  if (!user?.stripe_account) {
    return res
      .status(404)
      .send({ status: "Error", message: "You dont have an account" });
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
        throw { statusCode: 500, message: "Wallet account not found" };
      }

      if (walletAccount.status === "blocked") {
        throw { statusCode: 403, message: "Wallet blocked" };
      }

      const balanceBefore = Number(walletAccount.balance ?? 0);
      if (balanceBefore < payoutAmount) {
        throw { statusCode: 400, message: "Insufficient wallet balance" };
      }

      const updatedAccount = await tx.walletAccount.updateMany({
        where: {
          id: walletAccount.id,
          balance: { gte: payoutAmount },
        },
        data: { balance: { decrement: payoutAmount } },
      });

      if (updatedAccount.count === 0) {
        throw { statusCode: 409, message: "Balance changed, try again" };
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
    if (error?.statusCode) {
      return res
        .status(error.statusCode)
        .send({ status: "Error", message: error.message });
    }
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
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

    return res.status(502).send({
      status: "Error",
      message: "Stripe payout failed",
      error: error?.message ?? String(error),
    });
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
}

async function getWalletPayouts(req, res) {
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
}

async function createAccountLink(req, res) {
  try {
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
      },
    });

    if (!dbUser) {
      return res
        .status(404)
        .send({ status: "Error", message: "User not found" });
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
          first_name: (dbUser.name || "").split(" ")[0] || "",
          last_name: (dbUser.name || "").split(" ").slice(1).join(" ") || "",
        },
        metadata: {
          name: dbUser.name || "",
          email: dbUser.email,
          id: String(user.id),
        },
        business_profile: {
          mcc: "4121",
          name: dbUser.name || dbUser.email,
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
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function stripeRedirect(req, res) {
  const target = req.query?.target;
  if (!target) {
    return res.redirect("youconnext://perfil");
  }
  return res.redirect(String(target));
}

async function getLinkedExternalAccounts(req, res) {
  try {
    const user = req.user;

    const dbUser = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { stripe_account: true },
    });

    if (!dbUser?.stripe_account) {
      return res.status(404).send({
        status: "Error",
        message: "El usuario no tiene cuenta de Stripe",
      });
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
  } catch (error) {
    console.error("Error al obtener cuentas de Stripe:", error);
    return res.status(500).send({
      status: "Error",
      message: "No se pudo obtener la información de cobro",
    });
  }
}

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
  cancelPaymentIntent,
  createSetupIntent,
  createPayout,
  createWalletPayout,
  getWalletPayouts,
  createCheckoutPaymentIntent,
  resumeCheckoutPaymentIntent,
  rechargeWalletUser,
  createStripeAccountForUserEmpty,
  updateStripeAccountFromProfile,
  getLinkedExternalAccounts,
};
