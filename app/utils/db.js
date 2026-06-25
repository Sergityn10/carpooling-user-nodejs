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
  });

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
