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
      mcc: "5812",
      name: user?.name,
      product_description: "Servicio de carpooling",
      support_email: email,
      url: "https://carpooling.com",
    },
    capabilities: {
      card_payments: {
        requested: true,
      },
      transfers: {
        requested: true,
      },
    },
    tos_acceptance: {
      service_agreement: "full",
    },
  });
  return account;
}

export { createStripeConnectAcount };
