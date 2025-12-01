import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();
import database from "../database.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createSession = async (req, res) =>{
    const {amount, description, success_url, cancel_url} = req.body;
    const session = await stripe.checkout.sessions.create({
        line_items: [
            {
                price_data: {
                    product_data: {
                    name: "Trayecto",
                        
                    description: description,
                    },

                currency: "usd",
                unit_amount: amount
                },
                quantity: 1,
            }
        ],
        mode: "payment",
        success_url: success_url,
        cancel_url: cancel_url
    })
    return res.json(session)
}

async function createCheckoutPaymentIntent(req, res){
    const {amount, description,destination, success_url, cancel_url, } = req.body;
    const user = req.user
    const checkout_session = await stripe.checkout.sessions.create({
        customer: user.stripe_customer_account,
        line_items: [{
            price_data: {
                currency: 'eur',
                product_data: {
                    name: 'Reserva de trayecto',
                    description: description,
                },
                unit_amount: amount,
            },
            quantity: 1,
        }],
        payment_intent_data: {
            application_fee_amount: amount * 0.1,
            transfer_data: {
                destination: destination
            },
        },
        submit_type: 'pay',
        mode: 'payment',
        success_url: success_url,
        cancel_url: cancel_url,
    });
    return  res.status(200).send({checkout_session})
}

async function createStripeConnectAccount(req, res){
    const {email, country, name} = req.body;
    const user = req.user
    const Useraccount = await database.execute({
        sql: "SELECT * FROM accounts WHERE username= ?",
        args: [user.username]
    })
    console.log(Useraccount.rows)
    if(Useraccount.rows.length > 0){
        return res.status(400).send({status: "Error", message: "You already have an account"})
    }
  const account = await stripe.accounts.create({
    type: 'express',
    country: country,
    email: email,
    metadata: {
        username: user.username,
        email: user.email,
        id: user.id
    },
    
    business_type: 'individual',
    business_profile: {
      mcc: '5812',
      name:name,
      product_description: 'Servicio de carpooling',
      support_email: email,
      url: 'https://carpooling.com'
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
      service_agreement: "full"
}
});

    const result = await database.execute({
        sql: "UPDATE users SET stripe_account = ? WHERE username = ?",
        args: [account.id, user.username]
    });
    if(result.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to create stripe account"});
    }

    const insertAccount = await database.execute({
        sql: "INSERT INTO accounts (stripe_account_id, username) VALUES (?, ?)",
        args: [account.id, user.username]
    });

    if(insertAccount.rowsAffected === 0) {
        return res.status(500).send({status: "Error", message: "Failed to register user"});
    }

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: 'http://localhost:5173',
    return_url: 'http://localhost:5173',
    type: 'account_onboarding',
    collect: "eventually_due"
  });
  


  return res.status(200).send({status: "Success", message: "Stripe account created successfully", accountLink})
}

const getMyStripeConnectAccount = async (req, res) => {
    const user = req.user
    const { rows } = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?",
        args: [user.username]
    });
    console.log(rows[0])
    if(!rows[0]?.stripe_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }
    const stripe_account_id = rows[0].stripe_account;
    const account = await stripe.accounts.retrieve(stripe_account_id);
    console.log(account)
    return res.status(200).send({status: "Success", message: "Stripe account created successfully", account})
}

const createStripeCustomer = async (req, res) => {
    const {email, name} = req.body;
    const user = req.user
    if(user.stripe_customer_account){
        return res.status(400).send({status: "Error", message: "You already have an account"})
    }
    const customer = await stripe.customers.create({
        email: email,
        name: name,
        metadata: {
            username: user.username
        }
    });

    

    const result = await database.execute({
        sql: "UPDATE users SET stripe_customer_account = ? WHERE username = ?",
        args: [customer.id, user.username]
    });
    if(result.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to create stripe customer"});
    }

    return res.status(200).send({status: "Success", message: "Stripe customer created successfully", customer})
}
const createLoginLink = async (req, res) => {
    let return_url;
    let refresh_url;
    try{

    return_url = req.body.return_url?req.body.return_url:null;
    refresh_url = req.body.refresh_url?req.body.refresh_url:null;
    }
    catch(error){
        return res.status(400).send({status: "Error", message: "return_url or refresh_url is required"})
    }

    const user = req.user
    const { rows } = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?",
        args: [user.username]
    });
    console.log(rows[0])
    if(!rows[0]?.stripe_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }
    const stripe_account_id = rows[0].stripe_account;
    const loginLink = await stripe.accounts.createLoginLink(stripe_account_id);
    console.log(loginLink)
    return res.status(200).send({status: "Success", message: "Stripe customer created successfully", loginLink})
}

const createPaymentIntent = async (req, res) => {
    const {amount, currency, destination} = req.body;
    let applicationFeeAmount = amount * 0.1;
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: currency,
        metadata: {
            username: req.user.username,
            applicationFeeAmount: applicationFeeAmount
        },
        customer: req.user.stripe_customer_account,
        capture_method: 'manual',
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
            destination: destination
        }
    });
    return res.status(200).send({status: "Success", message: "Stripe payment intent created successfully", paymentIntent})
}
const getMyStripeCustomerAccount = async (req, res) => {
    const user = req.user
    const { rows } = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?",
        args: [user.username]
    });

    if(!rows[0]?.stripe_customer_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }
    const stripe_customer_account = rows[0].stripe_customer_account;
    const customer = await stripe.customers.retrieve(stripe_customer_account);

    return res.status(200).send({status: "Success", message: "Stripe customer created successfully", customer})
}


const createStripeLinkAccount = async (req, res) => {
    let return_url;
    let refresh_url;
    try{

    return_url = req.body.return_url;
    refresh_url = req.body.refresh_url;
    }
    catch(error){
        return res.status(400).send({status: "Error", message: "return_url or refresh_url is required"})
    }
    
    const user = req.user
    const stripe_account_id = user.stripe_account
    const accountLink = await stripe.accountLinks.create({
    account: stripe_account_id,
    refresh_url: refresh_url,
    return_url: return_url,
    type: 'account_onboarding',
    collect: "eventually_due"
  });
    return res.status(200).send({status: "Success", message: "Stripe account created successfully", accountLink})
}

const createStripeTransfer = async (req, res) => {
    const {amount, currency, destination} = req.body;
    const transfer = await stripe.transfers.create({
        amount: amount,
        currency: currency,
        destination: destination,
        metadata: {
            username: req.user.username
        }
    });
    return res.status(200).send({status: "Success", message: "Stripe transfer created successfully", transfer})
}

const createBillingPortal = async (req, res) => {
    const user = req.user
    console.log(user)
    const billingPortal = await stripe.billingPortal.sessions.create({
        customer: req.user.stripe_customer_account,
        return_url: 'http://localhost:5173',
    });
    return res.status(200).send({status: "Success", message: "Stripe billing portal created successfully", billingPortal})
}
//FUNCION PARA CREAR UN USUARIO EN STRIPE CONNECT

// if (!process.env.STRIPE_SECRET_KEY) {
//   throw new Error("STRIPE_SECRET_KEY is not set");
// }

// if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
//   throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
// }

// const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

// export async function createStripeConnectCustomer() {
//   const { userId } = await auth();

//   if (!userId) {
//     throw new Error("Not authenticated");
//   }

//   // Check if user already has a connect account
//   const existingStripeConnectId = await convex.query(
//     api.users.getUsersStripeConnectId,
//     {
//       userId,
//     }
//   );

//   if (existingStripeConnectId) {
//     return { account: existingStripeConnectId };
//   }

//   // Create new connect account
//   const account = await stripe.accounts.create({
//     type: "express",
//     capabilities: {
//       card_payments: { requested: true },
//       transfers: { requested: true },
//     },
//   });

//   // Update user with stripe connect id
//   await convex.mutation(api.users.updateOrCreateUserStripeConnectId, {
//     userId,
//     stripeConnectId: account.id,
//   });

//   return { account: account.id };
// }
async function getCashBalance(req, res){
    let stripe_account = req.user.stripe_account;
    if(!stripe_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }
    const cashBalance = await stripe.balance.retrieve({
        stripeAccount: stripe_account
    });
    const availableEuros = cashBalance.available.find(b => b.currency === 'eur');
    const pendingEuros = cashBalance.pending.find(b => b.currency === 'eur');

    // Convierte de céntimos a unidad principal para la visualización
    const availableAmount = availableEuros ? (availableEuros.amount / 100).toFixed(2) : '0.00';
    const pendingAmount = pendingEuros ? (pendingEuros.amount / 100).toFixed(2) : '0.00';
    return res.status(200).send({status: "Success", message: "Cash balance retrieved successfully", cashBalance, availableAmount, pendingAmount})
    
}

async function capturePaymentIntent(req, res){
    const {paymentIntentId} = req.params;
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    return res.status(200).send({status: "Success", message: "Payment intent captured successfully", paymentIntent})
}

async function createSetupIntent(req, res){
    const {paymentIntentId} = req.body;
    const setupIntent = await stripe.setupIntents.create({
        payment_method_types: ['card'],
        customer: req.user.stripe_customer_account,
        metadata: {
            username: req.user.username
        }
    });
    return res.status(200).send({status: "Success", message: "Setup intent created successfully", setupIntent})
}
async function createPayout(req, res){
    const {amount, currency} = req.body;
    const payout = await stripe.payouts.create({
        amount: amount,
        currency: currency,
        method: 'standard',
        metadata: {
            username: req.user.username
        }
    });
    return res.status(200).send({status: "Success", message: "Payout created successfully", payout})
}
async function createBankAccount(req, res){
    const {bankAccount} = req.body;
    const bankAccountRes = await stripe.customers.createSource({
        customer: req.user.stripe_customer_account,
        source: bankAccount
    });
    return res.status(200).send({status: "Success", message: "Bank account created successfully", bankAccountRes})
}
export const methods = {
    createSession,
    createStripeConnectAccount,
    createStripeLinkAccount,
    getMyStripeConnectAccount,
    createStripeCustomer,
    createStripeTransfer,
    createBillingPortal,
    getMyStripeCustomerAccount,
    createLoginLink,
    getCashBalance,
    createPaymentIntent,
    capturePaymentIntent,
    createSetupIntent,
    createPayout,
    createCheckoutPaymentIntent
}