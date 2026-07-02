import prisma from "../lib/prisma.js";
import { methods as utils } from "../utils/hashing.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function existUser(data) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: data }, { google_id: data }] },
  });
  return user ? true : null;
}

async function getUser(data) {
  return await prisma.user.findFirst({
    where: { OR: [{ email: data }, { google_id: data }] },
  });
}

async function createUser(
  { email, password, name },
  auth_method = "password",
  google_id = "",
) {
  const comprobarUser = await existUser(email);
  if (comprobarUser) {
    return { status: "Error", message: "Email already created" };
  }

  const customer_account = await stripe.customers.create({
    name,
    individual_name: name,
    email,
  });

  const hash = await utils.hashValue(10, password);
  const encryptedUserFields = cryptoUtils.encryptFields(
    { name },
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  const created = await prisma.user.create({
    data: {
      email,
      password: hash,
      name: encryptedUserFields.name,
      stripe_customer_account: customer_account.id,
      auth_method,
      ...(google_id ? { google_id } : {}),
    },
    include: { role: true },
  });

  let stripeAccountId = null;
  try {
    const nameParts = (name || "").trim().split(/\s+/);
    const stripeAccount = await stripe.accounts.create({
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
      metadata: { userId: created.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    await prisma.account.create({
      data: {
        stripe_account_id: stripeAccount.id,
        user_id: created.id,
        charges_enabled: stripeAccount.charges_enabled ?? false,
        transfers_enabled:
          String(stripeAccount.capabilities?.transfers ?? "").toLowerCase() ===
          "active",
        details_submitted: stripeAccount.details_submitted ?? false,
      },
    });
    stripeAccountId = stripeAccount.id;
    await prisma.user.update({
      where: { id: created.id },
      data: { stripe_account: stripeAccountId },
    });
  } catch (error) {
    console.error("Error creating Stripe Connect account:", error);
  }

  const activeDefs = await prisma.preferenceDefinition.findMany({
    where: { is_active: true },
  });

  if (activeDefs.length > 0) {
    await prisma.userPreference.createMany({
      data: activeDefs.map((pd) => ({
        user_id: created.id,
        pref_key: pd.pref_key,
        value: pd.default_value,
      })),
      skipDuplicates: true,
    });
  }

  return { status: "Success", user: created };
}

function createUsername(name) {
  return name.toLowerCase().replace(/\s/g, "");
}

export const methods = {
  getUser,
  existUser,
  createUser,
  createUsername,
};
