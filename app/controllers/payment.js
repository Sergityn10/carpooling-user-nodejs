import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();
import database from "../database.js";
import crypto from "crypto";
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

const rechargeWalletUser = async (req, res) =>{
    const {amount, description, success_url, cancel_url} = req.body;
    const user = req.user;
    const destination = user.stripe_account;

    const session = await stripe.checkout.sessions.create({
        line_items: [
            {
                price_data: {
                    product_data: {
                        name: 'Recarga de tu monedero virtual',
                        description: description,
                    },
                    currency: "eur",
                    unit_amount: amount
                },
                quantity: 1,
            }
        ],
        payment_intent_data: {
            transfer_data: {
                destination: destination,
            },
        },
        metadata: {
            userId: user.id,
            type: "recharge",
            typo: "recharge",
            description: description
        },
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
    console.log("Creando cuaenta de stripe a ", user.username)
    const existingUser = await database.execute({
        sql: "SELECT stripe_account, onboarding_ended FROM users WHERE username = ?",
        args: [user.username]
    });
    const existingStripeAccount = existingUser.rows?.[0]?.stripe_account;
    const onboardingEnded = Boolean(existingUser.rows?.[0]?.onboarding_ended);

    if(existingStripeAccount){
        if(onboardingEnded){
            return res.status(400).send({status: "Error", message: "You already have an account"})
        }

        const accountLink = await stripe.accountLinks.create({
            account: existingStripeAccount,
            refresh_url: process.env.ORIGIN,
            return_url: process.env.ORIGIN,
            type: 'account_onboarding',
            collect: "eventually_due"
        });

        return res.status(200).send({status: "Success", message: "Stripe onboarding link created successfully", accountLink})
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

    await database.execute({
        sql: "UPDATE users SET stripe_account = ?, onboarding_ended = 0 WHERE username = ?",
        args: [account.id, user.username]
    });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: process.env.ORIGIN,
    return_url: process.env.ORIGIN,
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
    if(!rows[0]?.stripe_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }
    const stripe_account_id = rows[0].stripe_account;
    const account = await stripe.accounts.retrieve(stripe_account_id);
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
    if(!rows[0]?.stripe_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }
    const stripe_account_id = rows[0].stripe_account;
    const loginLink = await stripe.accounts.createLoginLink(stripe_account_id);
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
    const billingPortal = await stripe.billingPortal.sessions.create({
        customer: req.user.stripe_customer_account,
        return_url: process.env.ORIGIN,
    });
    return res.status(200).send({status: "Success", message: "Stripe billing portal created successfully", billingPortal})
}

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

async function getWalletBalance(req, res){
    const user = req.user;

    const walletAccountRes = await database.execute({
        sql: `SELECT currency, balance AS balance_cents
              FROM wallet_accounts
              WHERE user_id = ?
              ORDER BY currency`,
        args: [user.id]
    });

    if(walletAccountRes.rows.length > 0){
        const balances = walletAccountRes.rows.map((r) => ({
            currency: r.currency,
            balance_cents: Number(r.balance_cents ?? 0)
        }));
        return res.status(200).send({status: "Success", balances})
    }

    // Fallback (por si aún no existe wallet_accounts en tu BD)
    const { rows } = await database.execute({
        sql: `SELECT currency, COALESCE(SUM(amount), 0) AS balance_cents
              FROM wallet_recharges
              WHERE user_id = ? AND status = 'succeeded'
              GROUP BY currency`,
        args: [user.id]
    });

    const balances = rows.map((r) => ({
        currency: r.currency,
        balance_cents: Number(r.balance_cents ?? 0)
    }));

    return res.status(200).send({status: "Success", balances})
}

async function getWalletTransactions(req, res){
    const user = req.user;
    const limitRaw = req.query?.limit;
    const offsetRaw = req.query?.offset;
    const limit = Number.isFinite(Number(limitRaw)) ? Math.min(200, Math.max(1, Number(limitRaw))) : 50;
    const offset = Number.isFinite(Number(offsetRaw)) ? Math.max(0, Number(offsetRaw)) : 0;

    const { rows } = await database.execute({
        sql: `SELECT
                id,
                wallet_account_id,
                user_id,
                currency,
                type,
                amount,
                status,
                balance_before,
                balance_after,
                description,
                stripe_checkout_session_id,
                stripe_payment_intent_id,
                stripe_event_id,
                stripe_payment_status,
                created_at
              FROM wallet_transactions
              WHERE user_id = ?
              ORDER BY datetime(created_at) DESC
              LIMIT ? OFFSET ?`,
        args: [user.id, limit, offset]
    });

    return res.status(200).send({status: "Success", transactions: rows, limit, offset})
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

function mapStripePayoutStatusToLocalStatus(stripeStatus){
    switch(String(stripeStatus ?? "").toLowerCase()){
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

async function createWalletPayout(req, res){
    const user = req.user;
    const { amount, currency, method, idempotency_key } = req.body ?? {};

    const payoutAmount = Number(amount);
    if(!Number.isFinite(payoutAmount) || payoutAmount <= 0){
        return res.status(400).send({status: "Error", message: "Invalid amount"})
    }
    const payoutCurrency = String(currency ?? "eur").toLowerCase();
    const payoutMethod = (method === "instant" ? "instant" : "standard");

    if(!user?.stripe_account){
        return res.status(404).send({status: "Error", message: "You dont have an account"})
    }

    const idempotencyKey = String(idempotency_key ?? req.headers?.["idempotency-key"] ?? crypto.randomUUID());

    let walletTransactionId;
    let walletPayoutId;
    let tx;

    try{
        tx = await database.transaction("write");

        const existing = await tx.execute({
            sql: `SELECT id, wallet_transaction_id, status, stripe_payout_id, stripe_payout_status, amount, currency, created_at
                  FROM wallet_payouts
                  WHERE idempotency_key = ? AND user_id = ?`,
            args: [idempotencyKey, user.id]
        });

        if(existing.rows.length > 0){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(200).send({status: "Success", payout: existing.rows[0], idempotency_key: idempotencyKey})
        }

        await tx.execute({
            sql: `INSERT INTO wallet_accounts (user_id, currency, balance)
                  VALUES (?, ?, 0)
                  ON CONFLICT(user_id, currency) DO NOTHING`,
            args: [user.id, payoutCurrency]
        });

        const walletAccountRes = await tx.execute({
            sql: "SELECT id, balance, status FROM wallet_accounts WHERE user_id = ? AND currency = ?",
            args: [user.id, payoutCurrency]
        });
        if(walletAccountRes.rows.length === 0){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(500).send({status: "Error", message: "Wallet account not found"})
        }

        const walletAccount = walletAccountRes.rows[0];
        if(walletAccount.status === "blocked"){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(403).send({status: "Error", message: "Wallet blocked"})
        }

        const balanceBefore = Number(walletAccount.balance ?? 0);
        if(balanceBefore < payoutAmount){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(400).send({status: "Error", message: "Insufficient wallet balance"})
        }

        const updateBalanceRes = await tx.execute({
            sql: `UPDATE wallet_accounts
                  SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND balance >= ?
                  RETURNING balance`,
            args: [payoutAmount, walletAccount.id, payoutAmount]
        });

        if(updateBalanceRes.rows.length === 0){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(409).send({status: "Error", message: "Balance changed, try again"})
        }

        const balanceAfter = Number(updateBalanceRes.rows?.[0]?.balance ?? (balanceBefore - payoutAmount));
        const description = `Wallet payout (${payoutMethod})`;
        const txInsert = await tx.execute({
            sql: `INSERT INTO wallet_transactions (
                    wallet_account_id,
                    user_id,
                    currency,
                    type,
                    amount,
                    status,
                    balance_before,
                    balance_after,
                    description
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  RETURNING id`,
            args: [
                walletAccount.id,
                user.id,
                payoutCurrency,
                "debit",
                payoutAmount,
                "pending",
                balanceBefore,
                balanceAfter,
                description
            ]
        });

        walletTransactionId = Number(txInsert.rows?.[0]?.id);

        if(!Number.isFinite(walletTransactionId)){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(500).send({status: "Error", message: "Failed to create wallet transaction"})
        }

        const payoutInsert = await tx.execute({
            sql: `INSERT INTO wallet_payouts (
                    wallet_account_id,
                    wallet_transaction_id,
                    user_id,
                    currency,
                    amount,
                    status,
                    method,
                    idempotency_key
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  RETURNING id`,
            args: [
                walletAccount.id,
                walletTransactionId,
                user.id,
                payoutCurrency,
                payoutAmount,
                "pending",
                payoutMethod,
                idempotencyKey
            ]
        });

        walletPayoutId = Number(payoutInsert.rows?.[0]?.id);
        if(!Number.isFinite(walletPayoutId)){
            try{ await tx.rollback(); } catch(_){ }
            return res.status(500).send({status: "Error", message: "Failed to create payout"})
        }

        await tx.commit();

        let stripePayout;
        try{
            stripePayout = await stripe.payouts.create({
                amount: payoutAmount,
                currency: payoutCurrency,
                method: payoutMethod,
                metadata: {
                    wallet_payout_id: String(walletPayoutId),
                    user_id: String(user.id)
                }
            }, {
                stripeAccount: user.stripe_account,
                idempotencyKey
            });
        }
        catch(error){
            let refundTx;
            try{
                refundTx = await database.transaction("write");

                const accountRes = await refundTx.execute({
                    sql: "SELECT id, balance FROM wallet_accounts WHERE user_id = ? AND currency = ?",
                    args: [user.id, payoutCurrency]
                });

                if(accountRes.rows.length > 0){
                    const acc = accountRes.rows[0];
                    const before = Number(acc.balance ?? 0);
                    const upd = await refundTx.execute({
                        sql: `UPDATE wallet_accounts
                              SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
                              WHERE id = ?
                              RETURNING balance`,
                        args: [payoutAmount, acc.id]
                    });
                    const after = Number(upd.rows?.[0]?.balance ?? (before + payoutAmount));

                    await refundTx.execute({
                        sql: `INSERT INTO wallet_transactions (
                                wallet_account_id,
                                user_id,
                                currency,
                                type,
                                amount,
                                status,
                                balance_before,
                                balance_after,
                                description
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [acc.id, user.id, payoutCurrency, "credit", payoutAmount, "succeeded", before, after, "Payout failed refund"]
                    });
                }

                await refundTx.execute({
                    sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
                    args: ["failed", walletTransactionId]
                });

                await refundTx.execute({
                    sql: `UPDATE wallet_payouts
                          SET status = ?, failure_reason = ?, updated_at = CURRENT_TIMESTAMP
                          WHERE id = ?`,
                    args: ["failed", error?.message ?? String(error), walletPayoutId]
                });

                await refundTx.commit();
            }
            catch(_e){
                if(refundTx){
                    try{ await refundTx.rollback(); } catch(_){ }
                }
            }

            return res.status(502).send({status: "Error", message: "Stripe payout failed", error: error?.message ?? String(error)})
        }

        const localStatus = mapStripePayoutStatusToLocalStatus(stripePayout?.status);
        await database.execute({
            sql: `UPDATE wallet_payouts
                  SET stripe_payout_id = ?, stripe_payout_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            args: [stripePayout.id, stripePayout.status ?? null, localStatus, walletPayoutId]
        });

        const txStatus = (localStatus === "succeeded") ? "succeeded" : "pending";
        await database.execute({
            sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
            args: [txStatus, walletTransactionId]
        });

        const payoutRes = await database.execute({
            sql: `SELECT id, wallet_transaction_id, status, stripe_payout_id, stripe_payout_status, amount, currency, created_at
                  FROM wallet_payouts
                  WHERE id = ?`,
            args: [walletPayoutId]
        });

        return res.status(200).send({
            status: "Success",
            payout: payoutRes.rows?.[0] ?? { id: walletPayoutId, stripe_payout_id: stripePayout.id },
            idempotency_key: idempotencyKey,
            stripe_payout: stripePayout
        })
    }
    catch(error){
        if(tx){
            try{ await tx.rollback(); } catch(_){ }
        }
        return res.status(500).send({status: "Error", message: error?.message ?? String(error)})
    }
}

async function getWalletPayouts(req, res){
    const user = req.user;
    const limitRaw = req.query?.limit;
    const offsetRaw = req.query?.offset;
    const limit = Number.isFinite(Number(limitRaw)) ? Math.min(200, Math.max(1, Number(limitRaw))) : 50;
    const offset = Number.isFinite(Number(offsetRaw)) ? Math.max(0, Number(offsetRaw)) : 0;

    const { rows } = await database.execute({
        sql: `SELECT
                id,
                wallet_account_id,
                wallet_transaction_id,
                user_id,
                currency,
                amount,
                status,
                method,
                idempotency_key,
                stripe_payout_id,
                stripe_payout_status,
                failure_reason,
                created_at
              FROM wallet_payouts
              WHERE user_id = ?
              ORDER BY datetime(created_at) DESC
              LIMIT ? OFFSET ?`,
        args: [user.id, limit, offset]
    });

    return res.status(200).send({status: "Success", payouts: rows, limit, offset})
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
    getWalletBalance,
    getWalletTransactions,
    createPaymentIntent,
    capturePaymentIntent,
    createSetupIntent,
    createPayout,
    createWalletPayout,
    getWalletPayouts,
    createCheckoutPaymentIntent,
    rechargeWalletUser
}