import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createStripeConnectAcount(user, country, email) {
  const account = await stripe.accounts.create({
    type: "express",
    country: country,
    email: email,
    metadata: {
      userId: String(user.id),
      email: user.email,
      id: user.id,
    },
    business_type: "individual",
    business_profile: {
      mcc: "4121",
      name: user?.name,
      product_description: "Servicio de carpooling YouConnext",
      support_email: email,
      url: process.env.ORIGIN || "https://carpooling-webapp-ten.vercel.app",
    },
    capabilities: {
      card_payments: {
        requested: true,
      },
      transfers: {
        requested: true,
      },
    },
  });
  return account;
}

export { createStripeConnectAcount };
