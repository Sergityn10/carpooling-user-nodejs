import database  from "../database.js";
export const status = {
    1: "pending",
    2: "succeeded",
    3: "failed",
    4: "canceled",
    5: "abandoned",
    6: "updated",
    7: "expired",
    8: "completed"
}

async function createEvent(req, res){
    const {source} = req.params;
    
    let data;

    data = JSON.stringify(req.body);

    try {
        await database.execute({
            sql: `INSERT INTO events (event_id, data, source, status)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(event_id) DO UPDATE SET
                    data = excluded.data,
                    source = excluded.source,
                    status = excluded.status`,
            args: [req.body.id, data, source, status[1]]
        });

        if(source === "stripe"){
            await handleStripeEvent(req, res);
        }
    } catch (error) {
        await database.execute({
            sql: "UPDATE events SET status = ?, processing_error = ? WHERE event_id = ?",
            args: [status[3], error?.message ?? String(error), req.body.id]
        });

        return res.status(200).send({status: "Success", message: "Event received (processing failed)"});
    }

    await database.execute({
        sql: "UPDATE events SET status = ? WHERE event_id = ?",
        args: [status[2], req.body.id]
    });
    
    return res.status(200).send({status: "Success", message: "Event created successfully"});
}

async function handleStripeEvent(req, res){
    const {source} = req.params;
    const jsonData = req.body
    const data = JSON.stringify(req.body);
    
    if(jsonData.type === "account.updated"){
        await handleAccountUpdated(jsonData.data)
    }
    if(jsonData.type === "checkout.session.completed"){
        await handleCheckoutSessionCompleted(jsonData)
    }
    if(jsonData.type === "checkout.session.expired"){
        await handleCheckoutSessionExpired(jsonData.data)
    }
    if(jsonData.type === "checkout.session.updated"){
        await handleCheckoutSessionUpdated(jsonData.data)
    }
    if(jsonData.type === "payment_intent.created"){
        await handlePaymentIntentCreated(jsonData.data)
    }
    if(jsonData.type === "payment_intent.updated"){
        await handlePaymentIntentUpdated(jsonData.data)
    }
    if(jsonData.type === "payment_intent.succeeded"){
        await handlePaymentIntentSucceeded(jsonData.data)
    }
    if(jsonData.type === "payment_intent.failed"){
        await handlePaymentIntentFailed(jsonData.data)
    }
    if(jsonData.type === "payment_intent.canceled"){
        await handlePaymentIntentCanceled(jsonData.data)
    }
    if(jsonData.type === "customer.created"){
        await handleCustomerCreated(jsonData.data)
    }
    if(jsonData.type === "customer.updated"){
        await handleCustomerUpdated(jsonData.data)
    }
    if(jsonData.type === "customer.deleted"){
        await handleCustomerDeleted(jsonData.data)
    }
    if(jsonData.type === "charge.succeeded"){
        await handleChargeSucceeded(jsonData.data)
    }
    if(String(jsonData.type ?? "").startsWith("payout.")){
        await handlePayoutEvent(jsonData)
    }
}
async function handleCustomerDeleted(jsonData){
    
}
async function handleChargeSucceeded(jsonData){
    
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

async function handlePayoutEvent(stripeEvent){
    const payout = stripeEvent?.data?.object;
    if(!payout){
        return;
    }

    const stripePayoutId = payout.id ?? null;
    const stripeEventId = stripeEvent.id ?? null;
    const stripeStatus = payout.status ?? null;
    const localStatus = mapStripePayoutStatusToLocalStatus(stripeStatus);
    const failureReason = payout.failure_message ?? payout.failure_code ?? null;

    if(!stripePayoutId){
        return;
    }

    try{
        await database.execute({ sql: "BEGIN IMMEDIATE", args: [] });

        if(stripeEventId){
            const already = await database.execute({
                sql: "SELECT id FROM wallet_payouts WHERE stripe_event_id = ?",
                args: [stripeEventId]
            });
            if(already.rows.length > 0){
                await database.execute({ sql: "COMMIT", args: [] });
                return;
            }
        }

        let payoutRes = await database.execute({
            sql: `SELECT id, wallet_account_id, wallet_transaction_id, user_id, currency, amount, status, stripe_payout_status
                  FROM wallet_payouts
                  WHERE stripe_payout_id = ?
                  LIMIT 1`,
            args: [stripePayoutId]
        });

        if(payoutRes.rows.length === 0){
            const walletPayoutIdRaw = payout?.metadata?.wallet_payout_id;
            const walletPayoutId = walletPayoutIdRaw != null ? Number(walletPayoutIdRaw) : null;

            if(Number.isFinite(walletPayoutId)){
                payoutRes = await database.execute({
                    sql: `SELECT id, wallet_account_id, wallet_transaction_id, user_id, currency, amount, status, stripe_payout_status
                          FROM wallet_payouts
                          WHERE id = ?
                          LIMIT 1`,
                    args: [walletPayoutId]
                });

                if(payoutRes.rows.length > 0){
                    await database.execute({
                        sql: `UPDATE wallet_payouts
                              SET stripe_payout_id = COALESCE(?, stripe_payout_id), updated_at = CURRENT_TIMESTAMP
                              WHERE id = ?`,
                        args: [stripePayoutId, walletPayoutId]
                    });
                }
            }
        }

        if(payoutRes.rows.length === 0){
            await database.execute({ sql: "COMMIT", args: [] });
            return;
        }

        const walletPayout = payoutRes.rows[0];
        const prevStatus = String(walletPayout.status ?? "");
        const isFinal = (prevStatus === "succeeded" || prevStatus === "failed" || prevStatus === "canceled");
        if(isFinal){
            await database.execute({ sql: "COMMIT", args: [] });
            return;
        }

        await database.execute({
            sql: `UPDATE wallet_payouts
                  SET stripe_payout_status = ?, status = ?, stripe_event_id = COALESCE(?, stripe_event_id), failure_reason = COALESCE(?, failure_reason), updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            args: [stripeStatus, localStatus, stripeEventId, failureReason, walletPayout.id]
        });

        if(localStatus === "succeeded"){
            await database.execute({
                sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
                args: ["succeeded", walletPayout.wallet_transaction_id]
            });

            await database.execute({ sql: "COMMIT", args: [] });
            return;
        }

        if(localStatus === "failed" || localStatus === "canceled"){
            const txStatus = (localStatus === "canceled") ? "canceled" : "failed";
            await database.execute({
                sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
                args: [txStatus, walletPayout.wallet_transaction_id]
            });

            const amount = Number(walletPayout.amount ?? 0);
            const accountRes = await database.execute({
                sql: "SELECT id, balance FROM wallet_accounts WHERE id = ?",
                args: [walletPayout.wallet_account_id]
            });

            if(accountRes.rows.length > 0 && Number.isFinite(amount) && amount > 0){
                const acc = accountRes.rows[0];
                const balanceBefore = Number(acc.balance ?? 0);
                const upd = await database.execute({
                    sql: `UPDATE wallet_accounts
                          SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
                          WHERE id = ?
                          RETURNING balance`,
                    args: [amount, acc.id]
                });
                const balanceAfter = Number(upd.rows?.[0]?.balance ?? (balanceBefore + amount));

                await database.execute({
                    sql: `INSERT INTO wallet_transactions (
                            wallet_account_id,
                            user_id,
                            currency,
                            type,
                            amount,
                            status,
                            balance_before,
                            balance_after,
                            description,
                            stripe_event_id,
                            stripe_payment_status
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                          ON CONFLICT(stripe_event_id) DO NOTHING`,
                    args: [
                        walletPayout.wallet_account_id,
                        walletPayout.user_id,
                        walletPayout.currency,
                        "credit",
                        amount,
                        "succeeded",
                        balanceBefore,
                        balanceAfter,
                        "Payout reversed",
                        stripeEventId,
                        stripeStatus
                    ]
                });
            }

            await database.execute({ sql: "COMMIT", args: [] });
            return;
        }

        await database.execute({
            sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
            args: ["pending", walletPayout.wallet_transaction_id]
        });

        await database.execute({ sql: "COMMIT", args: [] });
    }
    catch(error){
        try{ await database.execute({ sql: "ROLLBACK", args: [] }); } catch(_){ }
        throw error;
    }
}
async function handlePaymentIntentCreated(jsonData){
    const paymentIntent = jsonData.object;
    console.log(paymentIntent)
    console.log("Entro en el payment intent created")
    let payment_id = paymentIntent.id;
    console.log(payment_id)
    const result = await database.execute({
        sql: "INSERT INTO payment_intents (amount, currency, destination_account, state, description, sender_account, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
            paymentIntent.amount,
            paymentIntent.currency,
            paymentIntent.transfer_data?.destination ?? null,
            paymentIntent.status,
            paymentIntent.description ?? null,
            paymentIntent.customer ?? null,
            payment_id
        ]
    });
    if(result.rowsAffected === 0){
        return 
    }
}
async function handlePaymentIntentUpdated(jsonData){
    const paymentIntent = jsonData.object;
    console.log(paymentIntent)
    const result = await database.execute({
        sql: "UPDATE payment_intents SET state = ? WHERE payment_id = ?",
        args: [paymentIntent.status, paymentIntent.id]
    });
    if(result.rowsAffected === 0){
        return 
    }

}
async function handlePaymentIntentSucceeded(jsonData){
    const paymentIntent = jsonData.object;
    console.log(paymentIntent)
    const result = await database.execute({
        sql: "UPDATE payment_intents SET state = ? WHERE payment_id = ?",
        args: [paymentIntent.status, paymentIntent.id]
    });
    if(result.rowsAffected === 0){
        return 
    }
    
}
async function handlePaymentIntentFailed(jsonData){
    const paymentIntent = jsonData.object;
    console.log(paymentIntent)
    const result = await database.execute({
        sql: "UPDATE payment_intents SET state = ? WHERE payment_id = ?",
        args: [paymentIntent.status, paymentIntent.id]
    });
    if(result.rowsAffected === 0){
        return 
    }
    
}
async function handlePaymentIntentCanceled(jsonData){
    const paymentIntent = jsonData.object;
    console.log(paymentIntent)
    const result = await database.execute({
        sql: "UPDATE payment_intents SET state = ? WHERE payment_id = ?",
        args: [paymentIntent.status, paymentIntent.id]
    });
    if(result.rowsAffected === 0){
        return 
    }
    
}
async function handleCustomerUpdated(jsonData){
    const customer = jsonData.object;
    const result = await database.execute({
        sql: "UPDATE users SET stripe_customer_account = ? WHERE username = ?",
        args: [customer.id, customer.metadata.username]
    });
    if(result.rowsAffected === 0){
        return 
    }
}
async function handleCustomerCreated(jsonData){
    console.log("entre en el customer created")
    const customer = jsonData.object;
    const result = await database.execute({
        sql: "UPDATE users SET stripe_customer_account = ? WHERE username = ?",
        args: [customer.id, customer.metadata.username]
    });
    if(result.rowsAffected === 0){
        return 
    }
}
async function handleCheckoutSessionUpdated(jsonData){
    
}
async function handleCheckoutSessionCompleted(stripeEvent){
    const checkout_session = stripeEvent?.data?.object;
    if(!checkout_session){
        return;
    }

    const rechargeType = checkout_session?.metadata?.type ?? checkout_session?.metadata?.typo;
    console.log(rechargeType)
    if(rechargeType === "recharge"){
        console.log("entro en el if")

        const userIdRaw = checkout_session?.metadata?.userId;
        const userId = userIdRaw != null ? Number(userIdRaw) : null;

        if(Number.isFinite(userId)){
            const amount = Number(checkout_session.amount_total ?? 0);
            const currency = (checkout_session.currency ?? "eur").toLowerCase();
            const description = checkout_session?.metadata?.description ?? null;

            const rechargeStatus = checkout_session.payment_status === "paid" ? "succeeded" : "pending";

            await database.execute({
                sql: `INSERT INTO wallet_recharges (
                        user_id,
                        amount,
                        currency,
                        description,
                        status,
                        stripe_checkout_session_id,
                        stripe_payment_intent_id,
                        stripe_event_id,
                        stripe_payment_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(stripe_checkout_session_id) DO UPDATE SET
                        user_id = excluded.user_id,
                        amount = excluded.amount,
                        currency = excluded.currency,
                        description = excluded.description,
                        status = excluded.status,
                        stripe_payment_intent_id = excluded.stripe_payment_intent_id,
                        stripe_event_id = COALESCE(excluded.stripe_event_id, wallet_recharges.stripe_event_id),
                        stripe_payment_status = excluded.stripe_payment_status,
                        updated_at = CURRENT_TIMESTAMP`,
                args: [
                    userId,
                    amount,
                    currency,
                    description,
                    rechargeStatus,
                    checkout_session.id,
                    checkout_session.payment_intent ?? null,
                    stripeEvent.id ?? null,
                    checkout_session.payment_status ?? null
                ]
            });

            // Monedero (wallet_accounts + wallet_transactions)
            // Solo aumentamos el saldo cuando el pago está realmente completado
            if(rechargeStatus === "succeeded"){
                try{
                    await database.execute({ sql: "BEGIN IMMEDIATE", args: [] });

                    await database.execute({
                        sql: `INSERT INTO wallet_accounts (user_id, currency, balance)
                              VALUES (?, ?, 0)
                              ON CONFLICT(user_id, currency) DO NOTHING`,
                        args: [userId, currency]
                    });

                    const walletAccountRes = await database.execute({
                        sql: "SELECT id, balance, status FROM wallet_accounts WHERE user_id = ? AND currency = ?",
                        args: [userId, currency]
                    });

                    if(walletAccountRes.rows.length === 0){
                        await database.execute({ sql: "ROLLBACK", args: [] });
                        return;
                    }

                    const walletAccount = walletAccountRes.rows[0];
                    if(walletAccount.status === "blocked"){
                        await database.execute({ sql: "ROLLBACK", args: [] });
                        return;
                    }

                    const alreadyTx = await database.execute({
                        sql: "SELECT id FROM wallet_transactions WHERE stripe_checkout_session_id = ?",
                        args: [checkout_session.id]
                    });
                    if(alreadyTx.rows.length > 0){
                        await database.execute({ sql: "COMMIT", args: [] });
                        return;
                    }

                    const balanceBefore = Number(walletAccount.balance ?? 0);

                    const updateBalanceRes = await database.execute({
                        sql: `UPDATE wallet_accounts
                              SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
                              WHERE id = ?
                              RETURNING balance`,
                        args: [amount, walletAccount.id]
                    });

                    const balanceAfter = Number(updateBalanceRes.rows?.[0]?.balance ?? (balanceBefore + amount));

                    await database.execute({
                        sql: `INSERT INTO wallet_transactions (
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
                                stripe_payment_status
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                              ON CONFLICT(stripe_checkout_session_id) DO NOTHING`,
                        args: [
                            walletAccount.id,
                            userId,
                            currency,
                            "recharge",
                            amount,
                            "succeeded",
                            balanceBefore,
                            balanceAfter,
                            description,
                            checkout_session.id,
                            checkout_session.payment_intent ?? null,
                            stripeEvent.id ?? null,
                            checkout_session.payment_status ?? null
                        ]
                    });

                    await database.execute({ sql: "COMMIT", args: [] });
                }
                catch(error){
                    try{ await database.execute({ sql: "ROLLBACK", args: [] }); } catch(_){}
                    throw error;
                }
            }
        }
    }
    const reservaQuery = await database.execute({
        sql: "SELECT id_reserva FROM reservas WHERE stripe_checkout_session_id = ?",
        args: [checkout_session.id]
    });
    if(reservaQuery.rows.length === 0){
        return 
    }
    let reserva = reservaQuery.rows[0];

    await database.execute({
        sql: "UPDATE reservas SET status = ?, stripe_payment_intent_id = ?, stripe_payment_intent_status = ? WHERE id_reserva = ?",
        args: [status[8], checkout_session.payment_intent, checkout_session.payment_status, reserva.id_reserva]
    });

}

async function handleCheckoutSessionExpired(jsonData){
        let checkout_session = jsonData.object;
    const reservaQuery = await database.execute({
        sql: "SELECT id_reserva, id_trayecto FROM reservas WHERE stripe_checkout_session_id = ?",
        args: [checkout_session.id]
    });
    if(reservaQuery.rows.length === 0){
        return 
    }
    let reserva = reservaQuery.rows[0];

    await database.execute({
        sql: "DELETE FROM reservas WHERE id_reserva = ?",
        args: [reserva.id_reserva]
    });

    const disponibleQuery = await database.execute({
        sql: "SELECT disponible FROM trayectos WHERE id = ?",
        args: [reserva.id_trayecto]
    });
    const disponible = disponibleQuery.rows[0].disponible;
    disponible++;

    await database.execute({
        sql: "UPDATE trayectos SET disponible = ? WHERE id = ?",
        args: [disponible, reserva.id_trayecto]
    });

}
async function handleAccountUpdated(jsonData){

    const accountQuery = await database.execute({
        sql: "SELECT * FROM accounts WHERE stripe_account_id = ?",
        args: [jsonData.object.id]
    });

    if(accountQuery.rows.length === 0){
        return 
    }
    let account = accountQuery.rows[0];

    //ACTUALIZAR LA Cuenta
    await database.execute({
        sql: "UPDATE accounts SET charges_enabled = ?, transfers_enabled = ?, details_submitted = ? WHERE stripe_account_id = ?",
        args: [jsonData.object.charges_enabled, jsonData.object.payouts_enabled, jsonData.object.details_submitted, jsonData.object.id]
    });

    await database.execute({
        sql: "UPDATE users SET onboarding_ended = ? WHERE stripe_account = ?",
        args: [true, account.stripe_account_id]
    });

    
}
export const methods = {
    createEvent
}
