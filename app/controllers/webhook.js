import database from "../database.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const status = {
  1: "pending",
  2: "succeeded",
  3: "failed",
  4: "canceled",
  5: "abandoned",
  6: "updated",
  7: "expired",
  8: "completed",
};

function isNoSuchTableError(error, tableName) {
  const expected = `no such table: ${String(tableName ?? "").toLowerCase()}`;
  const msg = String(
    error?.message ??
      error?.cause?.message ??
      error?.cause?.proto?.message ??
      "",
  ).toLowerCase();

  return msg.includes(expected);
}

function isNoSuchColumnError(error, columnName) {
  const expected = `no such column: ${String(columnName ?? "").toLowerCase()}`;
  const msg = String(
    error?.message ??
      error?.cause?.message ??
      error?.cause?.proto?.message ??
      "",
  ).toLowerCase();

  return msg.includes(expected);
}

async function createEvent(req, res) {
  const { source } = req.params;

  let data;

  data = JSON.stringify(req.body);
  const eventId = req.body?.id ?? null;
  const eventType = String(req.body?.type ?? "unknown");
  const stripeObj = req.body?.data?.object;
  const paymentIntentId =
    (stripeObj?.object === "payment_intent"
      ? stripeObj?.id
      : stripeObj?.object === "checkout.session"
        ? stripeObj?.payment_intent
        : (stripeObj?.payment_intent ?? null)) ?? null;

  try {
    await database.execute({
      sql: `INSERT INTO events (event_id, event_type, payment_intent_id, data, source, status)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(event_id) DO UPDATE SET
                    event_type = excluded.event_type,
                    payment_intent_id = COALESCE(excluded.payment_intent_id, events.payment_intent_id),
                    data = excluded.data,
                    source = excluded.source,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP`,
      args: [eventId, eventType, paymentIntentId, data, source, status[1]],
    });

    if (source === "stripe") {
      await handleStripeEvent(req, res);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    try {
      await database.execute({
        sql: "UPDATE events SET status = ?, processing_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?",
        args: [status[3], error?.message ?? String(error), eventId],
      });
    } catch (_e) {}

    return res.status(200).send({
      status: "Success",
      message: "Event received (processing failed)",
    });
  }

  await database.execute({
    sql: "UPDATE events SET status = ? WHERE event_id = ?",
    args: [status[2], eventId],
  });

  return res
    .status(200)
    .send({ status: "Success", message: "Event created successfully" });
}

async function handleStripeEvent(req, res) {
  const { source } = req.params;
  const jsonData = req.body;
  const data = JSON.stringify(req.body);

  if (
    jsonData.type === "account.created" ||
    jsonData.type === "account.updated"
  ) {
    await handleAccountUpdated(jsonData.data);
  }
  if (jsonData.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(jsonData);
  }
  if (jsonData.type === "checkout.session.expired") {
    await handleCheckoutSessionExpired(jsonData.data);
  }
  if (jsonData.type === "checkout.session.updated") {
    await handleCheckoutSessionUpdated(jsonData.data);
  }
  if (jsonData.type === "payment_intent.created") {
    await handlePaymentIntentCreated(jsonData.data);
  }
  if (jsonData.type === "payment_intent.updated") {
    await handlePaymentIntentUpdated(jsonData.data);
  }
  if (jsonData.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(jsonData.data);
  }
  if (jsonData.type === "payment_intent.failed") {
    await handlePaymentIntentFailed(jsonData.data);
  }
  if (jsonData.type === "payment_intent.canceled") {
    await handlePaymentIntentCanceled(jsonData.data);
  }
  if (jsonData.type === "customer.created") {
    await handleCustomerCreated(jsonData.data);
  }
  if (jsonData.type === "customer.updated") {
    await handleCustomerUpdated(jsonData.data);
  }
  if (jsonData.type === "customer.deleted") {
    await handleCustomerDeleted(jsonData.data);
  }
  if (jsonData.type === "charge.succeeded") {
    await handleChargeSucceeded(jsonData.data);
  }
  if (String(jsonData.type ?? "").startsWith("payout.")) {
    await handlePayoutEvent(jsonData);
  }
}
async function handleCustomerDeleted(jsonData) {}
async function handleChargeSucceeded(jsonData) {}

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

async function handlePayoutEvent(stripeEvent) {
  const payout = stripeEvent?.data?.object;
  if (!payout) {
    return;
  }

  const stripePayoutId = payout.id ?? null;
  const stripeEventId = stripeEvent.id ?? null;
  const stripeStatus = payout.status ?? null;
  const localStatus = mapStripePayoutStatusToLocalStatus(stripeStatus);
  const failureReason = payout.failure_message ?? payout.failure_code ?? null;

  if (!stripePayoutId) {
    return;
  }

  let tx;
  try {
    tx = await database.transaction("write");

    if (stripeEventId) {
      const already = await tx.execute({
        sql: "SELECT id FROM wallet_payouts WHERE stripe_event_id = ?",
        args: [stripeEventId],
      });
      if (already.rows.length > 0) {
        try {
          await tx.rollback();
        } catch (_) {}
        return;
      }
    }

    let payoutRes = await tx.execute({
      sql: `SELECT id, wallet_account_id, wallet_transaction_id, user_id, currency, amount, status, stripe_payout_status
                  FROM wallet_payouts
                  WHERE stripe_payout_id = ?
                  LIMIT 1`,
      args: [stripePayoutId],
    });

    if (payoutRes.rows.length === 0) {
      const walletPayoutIdRaw = payout?.metadata?.wallet_payout_id;
      const walletPayoutId =
        walletPayoutIdRaw != null ? Number(walletPayoutIdRaw) : null;

      if (Number.isFinite(walletPayoutId)) {
        payoutRes = await tx.execute({
          sql: `SELECT id, wallet_account_id, wallet_transaction_id, user_id, currency, amount, status, stripe_payout_status
                          FROM wallet_payouts
                          WHERE id = ?
                          LIMIT 1`,
          args: [walletPayoutId],
        });

        if (payoutRes.rows.length > 0) {
          await tx.execute({
            sql: `UPDATE wallet_payouts
                              SET stripe_payout_id = COALESCE(?, stripe_payout_id), updated_at = CURRENT_TIMESTAMP
                              WHERE id = ?`,
            args: [stripePayoutId, walletPayoutId],
          });
        }
      }
    }

    if (payoutRes.rows.length === 0) {
      try {
        await tx.rollback();
      } catch (_) {}
      return;
    }

    const walletPayout = payoutRes.rows[0];
    const prevStatus = String(walletPayout.status ?? "");
    const isFinal =
      prevStatus === "succeeded" ||
      prevStatus === "failed" ||
      prevStatus === "canceled";
    if (isFinal) {
      try {
        await tx.rollback();
      } catch (_) {}
      return;
    }

    await tx.execute({
      sql: `UPDATE wallet_payouts
                  SET stripe_payout_status = ?, status = ?, stripe_event_id = COALESCE(?, stripe_event_id), failure_reason = COALESCE(?, failure_reason), updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
      args: [
        stripeStatus,
        localStatus,
        stripeEventId,
        failureReason,
        walletPayout.id,
      ],
    });

    if (localStatus === "succeeded") {
      await tx.execute({
        sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
        args: ["succeeded", walletPayout.wallet_transaction_id],
      });

      await tx.commit();
      return;
    }

    if (localStatus === "failed" || localStatus === "canceled") {
      const txStatus = localStatus === "canceled" ? "canceled" : "failed";
      await tx.execute({
        sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
        args: [txStatus, walletPayout.wallet_transaction_id],
      });

      const amount = Number(walletPayout.amount ?? 0);
      const accountRes = await tx.execute({
        sql: "SELECT id, balance FROM wallet_accounts WHERE id = ?",
        args: [walletPayout.wallet_account_id],
      });

      if (accountRes.rows.length > 0 && Number.isFinite(amount) && amount > 0) {
        const acc = accountRes.rows[0];
        const balanceBefore = Number(acc.balance ?? 0);
        const upd = await tx.execute({
          sql: `UPDATE wallet_accounts
                          SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
                          WHERE id = ?
                          RETURNING balance`,
          args: [amount, acc.id],
        });
        const balanceAfter = Number(
          upd.rows?.[0]?.balance ?? balanceBefore + amount,
        );

        await tx.execute({
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
            stripeStatus,
          ],
        });
      }

      await tx.commit();
      return;
    }

    await tx.execute({
      sql: "UPDATE wallet_transactions SET status = ? WHERE id = ?",
      args: ["pending", walletPayout.wallet_transaction_id],
    });

    await tx.commit();
  } catch (error) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw error;
  }
}
async function handlePaymentIntentCreated(jsonData) {
  const paymentIntent = jsonData.object;

  const stripePaymentIntentId = paymentIntent?.id ?? null;
  if (!stripePaymentIntentId) {
    return;
  }

  const amount = Number(paymentIntent?.amount ?? 0) / 100;
  const currency = String(paymentIntent?.currency ?? "eur").toLowerCase();
  const state = String(paymentIntent?.status ?? "pending");
  const clientSecret = paymentIntent?.client_secret ?? null;

  const destinationAccount = paymentIntent?.transfer_data?.destination ?? null;
  const senderAccount = paymentIntent?.metadata?.sender_account ?? null;
  const description = paymentIntent?.description ?? null;
  const id_reserva = paymentIntent?.metadata?.id_reserva ?? null;

  await database.execute({
    sql: `INSERT INTO payment_intents (
            stripe_payment_id,
            amount,
            currency,
            description,
            destination_account,
            sender_account,
            state,
            client_secret,
            checkout_session_id,
            id_reserva
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stripe_payment_id) DO UPDATE SET
            amount = excluded.amount,
            currency = excluded.currency,
            description = COALESCE(excluded.description, payment_intents.description),
            destination_account = COALESCE(excluded.destination_account, payment_intents.destination_account),
            sender_account = COALESCE(excluded.sender_account, payment_intents.sender_account),
            state = excluded.state,
            client_secret = COALESCE(excluded.client_secret, payment_intents.client_secret),
            id_reserva = COALESCE(excluded.id_reserva, payment_intents.id_reserva),
            updated_at = CURRENT_TIMESTAMP`,
    args: [
      stripePaymentIntentId,
      amount,
      currency,
      description,
      destinationAccount,
      senderAccount,
      state,
      clientSecret,
      null,
      id_reserva,
    ],
  });

  if (id_reserva) {
    await database.execute({
      sql: `UPDATE reservas
                  SET stripe_payment_intent_id = CASE
                        WHEN stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ? THEN ?
                        ELSE stripe_payment_intent_id
                      END
                  WHERE id_reserva = ?`,
      args: [stripePaymentIntentId, stripePaymentIntentId, id_reserva],
    });
  }
}
async function handlePaymentIntentUpdated(jsonData) {
  const paymentIntent = jsonData.object;

  await database.execute({
    sql: "UPDATE reservas SET stripe_payment_intent_status = ? WHERE stripe_payment_intent_id = ?",
    args: [paymentIntent.status, paymentIntent.id],
  });

  await database.execute({
    sql: "UPDATE wallet_recharges SET stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
    args: [paymentIntent.status, paymentIntent.id],
  });

  await database.execute({
    sql: "UPDATE wallet_transactions SET stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
    args: [paymentIntent.status, paymentIntent.id],
  });
}
async function handlePaymentIntentSucceeded(jsonData) {
  const paymentIntent = jsonData.object;
  let id_reserva = paymentIntent?.metadata?.id_reserva;
  if (!id_reserva) {
    let paymentIntentRes = await database.execute({
      sql: "SELECT * FROM payment_intents WHERE stripe_payment_id = ?",
      args: [paymentIntent.id],
    });
    id_reserva = paymentIntentRes.rows[0].id_reserva;
  }
  const stripePaymentIntentId = paymentIntent?.id ?? null;
  const currency = String(paymentIntent?.currency ?? "eur").toLowerCase();
  const grossAmountCents = Number(
    paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0,
  );

  if (
    !stripePaymentIntentId ||
    !Number.isFinite(grossAmountCents) ||
    grossAmountCents <= 0
  ) {
    return;
  }

  const paymentIntentRowRes = await database.execute({
    sql: `SELECT sender_account, destination_account, description
              FROM payment_intents
              WHERE stripe_payment_id = ?
              LIMIT 1`,
    args: [stripePaymentIntentId],
  });
  const senderAccount = paymentIntentRowRes.rows?.[0]?.sender_account ?? null;
  const destinationAccount =
    paymentIntentRowRes.rows?.[0]?.destination_account ?? null;
  const paymentDescription = String(
    paymentIntentRowRes.rows?.[0]?.description ?? "",
  );

  if (!senderAccount || !destinationAccount) {
    return;
  }

  const payerRes = await database.execute({
    sql: "SELECT id FROM users WHERE stripe_account = ? LIMIT 1",
    args: [senderAccount],
  });
  const receiverRes = await database.execute({
    sql: "SELECT id FROM users WHERE stripe_account = ? LIMIT 1",
    args: [destinationAccount],
  });

  const payerUserId = Number(payerRes.rows?.[0]?.id);
  const receiverUserId = Number(receiverRes.rows?.[0]?.id);

  const platformUserIdRaw =
    process.env.PLATFORM_USER_ID ?? process.env.COMMISSION_USER_ID ?? "";
  const platformUserId = Number(platformUserIdRaw);

  if (
    !Number.isFinite(payerUserId) ||
    !Number.isFinite(receiverUserId) ||
    !Number.isFinite(platformUserId)
  ) {
    throw new Error(
      "Missing payer/receiver/platform user id for wallet transactions",
    );
  }

  const commissionAmountCents = Math.round(grossAmountCents * 0.15);
  const netAmountCents = grossAmountCents - commissionAmountCents;

  if (netAmountCents < 0) {
    throw new Error("Invalid commission calculation (net < 0)");
  }

  let tx;
  try {
    tx = await database.transaction("write");

    await tx.execute({
      sql: "UPDATE reservas SET status = ? WHERE id_reserva = ?",
      args: [status[8], id_reserva],
    });

    const ensureWalletAccount = async (userId) => {
      await tx.execute({
        sql: `INSERT INTO wallet_accounts (user_id, currency, balance)
                      VALUES (?, ?, 0)
                      ON CONFLICT(user_id, currency) DO NOTHING`,
        args: [userId, currency],
      });

      const res = await tx.execute({
        sql: "SELECT id, balance, status FROM wallet_accounts WHERE user_id = ? AND currency = ? LIMIT 1",
        args: [userId, currency],
      });

      if (res.rows.length === 0) {
        throw new Error("Wallet account not found");
      }

      const acc = res.rows[0];
      if (String(acc.status ?? "active") === "blocked") {
        throw new Error("Wallet blocked");
      }

      return {
        id: Number(acc.id),
        balance: Number(acc.balance ?? 0),
      };
    };

    const applyWalletTx = async ({ userId, type, amount, description }) => {
      const already = await tx.execute({
        sql: `SELECT id
                      FROM wallet_transactions
                      WHERE stripe_payment_intent_id = ? AND id_reserva = ? AND type = ?
                      LIMIT 1`,
        args: [stripePaymentIntentId, id_reserva, type],
      });
      if (already.rows.length > 0) {
        return;
      }

      const acc = await ensureWalletAccount(userId);
      const balanceBefore = Number(acc.balance ?? 0);

      const upd = await tx.execute({
        sql: `UPDATE wallet_accounts
                      SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?
                      RETURNING balance`,
        args: [amount, acc.id],
      });

      const balanceAfter = Number(
        upd.rows?.[0]?.balance ?? balanceBefore + amount,
      );

      await tx.execute({
        sql: `INSERT INTO wallet_transactions (
                        wallet_account_id,
                        user_id,
                        currency,
                        id_reserva,
                        type,
                        amount,
                        balance_before,
                        balance_after,
                        description,
                        stripe_payment_intent_id
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          acc.id,
          userId,
          currency,
          id_reserva,
          type,
          amount,
          balanceBefore,
          balanceAfter,
          description,
          stripePaymentIntentId,
        ],
      });
    };

    const baseDesc = paymentDescription
      ? `Reserva: ${paymentDescription}`
      : "Reserva";

    await applyWalletTx({
      userId: payerUserId,
      type: "reservation_payment",
      amount: -grossAmountCents,
      description: `${baseDesc} (pago)`,
    });

    await applyWalletTx({
      userId: receiverUserId,
      type: "reservation_revenue",
      amount: netAmountCents,
      description: `${baseDesc} (ingreso)`,
    });

    await applyWalletTx({
      userId: platformUserId,
      type: "commision",
      amount: commissionAmountCents,
      description: `${baseDesc} (comisión 15%)`,
    });

    await tx.commit();
  } catch (error) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw error;
  }
}
async function handlePaymentIntentFailed(jsonData) {
  const paymentIntent = jsonData.object;

  await database.execute({
    sql: "UPDATE reservas SET status = ?, stripe_payment_intent_status = ? WHERE stripe_payment_intent_id = ?",
    args: [status[3], paymentIntent.status, paymentIntent.id],
  });

  await database.execute({
    sql: "UPDATE wallet_recharges SET status = ?, stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
    args: [status[3], paymentIntent.status, paymentIntent.id],
  });

  try {
    await database.execute({
      sql: "UPDATE wallet_transactions SET status = ?, stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
      args: [status[3], paymentIntent.status, paymentIntent.id],
    });
  } catch (error) {
    if (!isNoSuchColumnError(error, "status")) {
      throw error;
    }
    await database.execute({
      sql: "UPDATE wallet_transactions SET stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
      args: [paymentIntent.status, paymentIntent.id],
    });
  }
}
async function handlePaymentIntentCanceled(jsonData) {
  const paymentIntent = jsonData.object;

  await database.execute({
    sql: "UPDATE payment_intents SET state = ? WHERE stripe_payment_id = ?",
    args: [paymentIntent.status, paymentIntent.id],
  });

  await database.execute({
    sql: "UPDATE reservas SET status = ?, stripe_payment_intent_status = ? WHERE stripe_payment_intent_id = ?",
    args: [status[4], paymentIntent.status, paymentIntent.id],
  });

  await database.execute({
    sql: "UPDATE wallet_recharges SET status = ?, stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
    args: [status[4], paymentIntent.status, paymentIntent.id],
  });

  try {
    await database.execute({
      sql: "UPDATE wallet_transactions SET status = ?, stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
      args: [status[4], paymentIntent.status, paymentIntent.id],
    });
  } catch (error) {
    if (!isNoSuchColumnError(error, "status")) {
      throw error;
    }
    await database.execute({
      sql: "UPDATE wallet_transactions SET stripe_payment_status = ? WHERE stripe_payment_intent_id = ?",
      args: [paymentIntent.status, paymentIntent.id],
    });
  }
}
async function handleCustomerUpdated(jsonData) {
  const customer = jsonData.object;
  const userIdRaw =
    customer?.metadata?.userId ??
    customer?.metadata?.user_id ??
    customer?.metadata?.id_user ??
    null;
  const userId = userIdRaw != null ? Number(userIdRaw) : null;
  if (!Number.isFinite(userId)) {
    return;
  }
  const result = await database.execute({
    sql: "UPDATE users SET stripe_customer_account = ? WHERE id = ?",
    args: [customer.id, userId],
  });
  if (result.rowsAffected === 0) {
    return;
  }
}
async function handleCustomerCreated(jsonData) {
  const customer = jsonData.object;
  const userIdRaw =
    customer?.metadata?.userId ??
    customer?.metadata?.user_id ??
    customer?.metadata?.id_user ??
    null;
  const userId = userIdRaw != null ? Number(userIdRaw) : null;
  if (!Number.isFinite(userId)) {
    return;
  }
  const result = await database.execute({
    sql: "UPDATE users SET stripe_customer_account = ? WHERE id = ?",
    args: [customer.id, userId],
  });
  if (result.rowsAffected === 0) {
    return;
  }
}
async function handleCheckoutSessionUpdated(jsonData) {}
async function handleCheckoutSessionCompleted(stripeEvent) {
  const sessionFromEvent = stripeEvent?.data?.object;
  if (!sessionFromEvent) {
    return;
  }

  let checkout_session = sessionFromEvent;
  try {
    checkout_session = await stripe.checkout.sessions.retrieve(
      sessionFromEvent.id,
      {
        expand: ["payment_intent"],
      },
    );
  } catch (_) {}

  const type =
    checkout_session?.metadata?.type ?? checkout_session?.metadata?.typo;
  let paymentIntent = checkout_session.payment_intent;
  if (type === "recharge") {
    const userIdRaw = checkout_session?.metadata?.userId;
    const userId = userIdRaw != null ? Number(userIdRaw) : null;

    // if(Number.isFinite(userId)){
    //     const amount = Number(checkout_session.amount_total ?? 0);
    //     const currency = (checkout_session.currency ?? "eur").toLowerCase();
    //     const description = checkout_session?.metadata?.description ?? null;
    //     const typePaymente = checkout_session?.metadata?.type ?? null

    //     const rechargeStatus = checkout_session.payment_status === "paid" ? "succeeded" : "pending";

    //     await database.execute({
    //         sql: `INSERT INTO wallet_recharges (
    //                 user_id,
    //                 amount,
    //                 currency,
    //                 description,
    //                 status,
    //                 stripe_checkout_session_id,
    //                 stripe_payment_intent_id,
    //                 stripe_event_id,
    //                 stripe_payment_status
    //             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    //             ON CONFLICT(stripe_checkout_session_id) DO UPDATE SET
    //                 user_id = excluded.user_id,
    //                 amount = excluded.amount,
    //                 currency = excluded.currency,
    //                 description = excluded.description,
    //                 status = excluded.status,
    //                 stripe_payment_intent_id = excluded.stripe_payment_intent_id,
    //                 stripe_event_id = COALESCE(excluded.stripe_event_id, wallet_recharges.stripe_event_id),
    //                 stripe_payment_status = excluded.stripe_payment_status,
    //                 updated_at = CURRENT_TIMESTAMP`,
    //         args: [
    //             userId,
    //             amount,
    //             currency,
    //             description,
    //             rechargeStatus,
    //             checkout_session.id,
    //             checkout_session.payment_intent ?? null,
    //             stripeEvent.id ?? null,
    //             checkout_session.payment_status ?? null
    //         ]
    //     });

    //     // Monedero (wallet_accounts + wallet_transactions)
    //     // Solo aumentamos el saldo cuando el pago está realmente completado
    //     if(rechargeStatus === "succeeded"){
    //         let tx;
    //         try{
    //             tx = await database.transaction("write");

    //             await tx.execute({
    //                 sql: `INSERT INTO wallet_accounts (user_id, currency, balance)
    //                       VALUES (?, ?, 0)
    //                       ON CONFLICT(user_id, currency) DO NOTHING`,
    //                 args: [userId, currency]
    //             });

    //             const walletAccountRes = await tx.execute({
    //                 sql: "SELECT id, balance, status FROM wallet_accounts WHERE user_id = ? AND currency = ?",
    //                 args: [userId, currency]
    //             });

    //             if(walletAccountRes.rows.length === 0){
    //                 try{ await tx.rollback(); } catch(_){ }
    //                 return;
    //             }

    //             const walletAccount = walletAccountRes.rows[0];
    //             if(walletAccount.status === "blocked"){
    //                 try{ await tx.rollback(); } catch(_){ }
    //                 return;
    //             }

    //             const alreadyTx = await tx.execute({
    //                 sql: "SELECT id FROM wallet_transactions WHERE stripe_checkout_session_id = ?",
    //                 args: [checkout_session.id]
    //             });
    //             if(alreadyTx.rows.length > 0){
    //                 try{ await tx.rollback(); } catch(_){ }
    //                 return;
    //             }

    //             const balanceBefore = Number(walletAccount.balance ?? 0);

    //             const updateBalanceRes = await tx.execute({
    //                 sql: `UPDATE wallet_accounts
    //                       SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
    //                       WHERE id = ?
    //                       RETURNING balance`,
    //                 args: [amount, walletAccount.id]
    //             });

    //             const balanceAfter = Number(updateBalanceRes.rows?.[0]?.balance ?? (balanceBefore + amount));

    //             await tx.execute({
    //                 sql: `INSERT INTO wallet_transactions (
    //                         wallet_account_id,
    //                         user_id,
    //                         currency,
    //                         type,
    //                         amount,
    //                         status,
    //                         balance_before,
    //                         balance_after,
    //                         description,
    //                         stripe_checkout_session_id,
    //                         stripe_payment_intent_id,
    //                         stripe_event_id,
    //                         stripe_payment_status
    //                       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    //                       ON CONFLICT(stripe_checkout_session_id) DO NOTHING`,
    //                 args: [
    //                     walletAccount.id,
    //                     userId,
    //                     currency,
    //                     "recharge",
    //                     amount,
    //                     "succeeded",
    //                     balanceBefore,
    //                     balanceAfter,
    //                     description,
    //                     checkout_session.id,
    //                     checkout_session.payment_intent ?? null,
    //                     stripeEvent.id ?? null,
    //                     checkout_session.payment_status ?? null
    //                 ]
    //             });

    //             await tx.commit();
    //         }
    //         catch(error){
    //             if(tx){
    //                 try{ await tx.rollback(); } catch(_){ }
    //             }
    //             throw error;
    //         }
    //     }
    // }

    return;
  }

  if (type === "reserva") {
    const id_user = checkout_session?.metadata?.id_user ?? null;
    const id_reserva = checkout_session?.metadata?.id_reserva ?? null;
    const trayectoIdRaw = checkout_session?.metadata?.id_trayecto;
    const trayectoId = trayectoIdRaw != null ? Number(trayectoIdRaw) : null;

    if (!id_user || !Number.isFinite(trayectoId)) {
      return;
    }

    const runNoTx = async () => {
      const userRes = await database.execute({
        sql: "SELECT 1 FROM users WHERE id = ? LIMIT 1",
        args: [id_user],
      });
      if (userRes.rows.length === 0) {
        return;
      }

      const trayectoRes = await database.execute({
        sql: "SELECT 1 FROM trayectos WHERE id = ? LIMIT 1",
        args: [trayectoId],
      });
      if (trayectoRes.rows.length === 0) {
        return;
      }

      const existingReserva = await database.execute({
        sql: "SELECT id_reserva FROM reservas WHERE id_reserva = ? LIMIT 1",
        args: [id_reserva],
      });
      if (existingReserva.rows.length === 0) {
        return;
      }

      const availableRes = await database.execute({
        sql: "SELECT disponible FROM trayectos WHERE id = ?",
        args: [trayectoId],
      });
      const disponible = Number(availableRes.rows?.[0]?.disponible ?? 0);
      if (!Number.isFinite(disponible) || disponible <= 0) {
        return;
      }

      const decRes = await database.execute({
        sql: "UPDATE trayectos SET disponible = disponible - 1 WHERE id = ? AND disponible > 0",
        args: [trayectoId],
      });
      if (Number(decRes.rowsAffected ?? 0) === 0) {
        return;
      }

      await database.execute({
        sql: "UPDATE reservas SET status = ? WHERE id_reserva = ?",
        args: [status[8], id_reserva],
      });

      const paymentIntentId =
        (typeof paymentIntent === "string"
          ? paymentIntent
          : paymentIntent?.id) ?? null;
      if (paymentIntentId) {
        await database.execute({
          sql: `UPDATE reservas
                        SET stripe_payment_intent_id = CASE
                              WHEN stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ? THEN ?
                              ELSE stripe_payment_intent_id
                            END
                        WHERE id_reserva = ?`,
          args: [paymentIntentId, paymentIntentId, id_reserva],
        });
      }
    };

    let tx;
    try {
      tx = await database.transaction("write");

      const userRes = await tx.execute({
        sql: "SELECT 1 FROM users WHERE id = ? LIMIT 1",
        args: [id_user],
      });
      if (userRes.rows.length === 0) {
        try {
          await tx.rollback();
        } catch (_) {}
        return;
      }

      const trayectoRes = await tx.execute({
        sql: "SELECT 1 FROM trayectos WHERE id = ? LIMIT 1",
        args: [trayectoId],
      });
      if (trayectoRes.rows.length === 0) {
        try {
          await tx.rollback();
        } catch (_) {}
        return;
      }

      const existingReserva = await tx.execute({
        sql: "SELECT id_reserva FROM reservas WHERE id_reserva = ? LIMIT 1",
        args: [id_reserva],
      });

      const existed = existingReserva.rows.length > 0;

      if (!existed) return;

      const availableRes = await tx.execute({
        sql: "SELECT disponible FROM trayectos WHERE id = ?",
        args: [trayectoId],
      });

      const disponible = Number(availableRes.rows?.[0]?.disponible ?? 0);
      if (!Number.isFinite(disponible) || disponible <= 0) {
        try {
          await tx.rollback();
        } catch (_) {}
        return;
      }

      const decRes = await tx.execute({
        sql: "UPDATE trayectos SET disponible = disponible - 1 WHERE id = ? AND disponible > 0",
        args: [trayectoId],
      });

      if (Number(decRes.rowsAffected ?? 0) === 0) {
        try {
          await tx.rollback();
        } catch (_) {}
        return;
      }

      await tx.execute({
        sql: "UPDATE reservas SET status = ? WHERE id_reserva = ?",
        args: [status[8], id_reserva],
      });

      const paymentIntentId =
        (typeof paymentIntent === "string"
          ? paymentIntent
          : paymentIntent?.id) ?? null;

      if (paymentIntentId) {
        await tx.execute({
          sql: `UPDATE reservas
                        SET stripe_payment_intent_id = CASE
                              WHEN stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ? THEN ?
                              ELSE stripe_payment_intent_id
                            END
                        WHERE id_reserva = ?`,
          args: [paymentIntentId, paymentIntentId, id_reserva],
        });
      }

      await tx.commit();
    } catch (error) {
      if (tx) {
        try {
          await tx.rollback();
        } catch (_) {}
      }
      const msg = String(
        error?.message ??
          error?.cause?.message ??
          error?.cause?.proto?.message ??
          "",
      );
      if (msg.includes("HTTP status 404")) {
        await runNoTx();
        return;
      }
      throw error;
    }

    return;
  }
}

async function handleCheckoutSessionExpired(jsonData) {
  let checkout_session = jsonData.object;
  const reservaQuery = await database.execute({
    sql: "SELECT id_reserva, id_trayecto FROM reservas WHERE stripe_checkout_session_id = ?",
    args: [checkout_session.id],
  });
  if (reservaQuery.rows.length === 0) {
    return;
  }
  let reserva = reservaQuery.rows[0];

  await database.execute({
    sql: "DELETE FROM reservas WHERE id_reserva = ?",
    args: [reserva.id_reserva],
  });

  const disponibleQuery = await database.execute({
    sql: "SELECT disponible FROM trayectos WHERE id = ?",
    args: [reserva.id_trayecto],
  });
  let disponible = disponibleQuery.rows[0].disponible;
  disponible++;

  await database.execute({
    sql: "UPDATE trayectos SET disponible = ? WHERE id = ?",
    args: [disponible, reserva.id_trayecto],
  });
}
async function handleAccountUpdated(jsonData) {
  const stripeAccount = jsonData?.object;
  if (!stripeAccount?.id) {
    return;
  }

  const stripeAccountId = stripeAccount.id;
  const userIdRaw =
    stripeAccount?.metadata?.userId ??
    stripeAccount?.metadata?.user_id ??
    stripeAccount?.metadata?.id_user ??
    null;
  let userId = userIdRaw != null ? Number(userIdRaw) : null;

  const chargesEnabled = Boolean(stripeAccount.charges_enabled);
  const transfersEnabled =
    String(stripeAccount?.capabilities?.transfers ?? "").toLowerCase() ===
    "active";
  const detailsSubmitted = Boolean(stripeAccount.details_submitted);

  // const onboardingComplete = (detailsSubmitted && chargesEnabled && transfersEnabled);
  const onboardingComplete = detailsSubmitted;
  let tx;
  try {
    tx = await database.transaction("write");

    if (!Number.isFinite(userId)) {
      const userRes = await tx.execute({
        sql: "SELECT id FROM users WHERE stripe_account = ?",
        args: [stripeAccountId],
      });
      if (userRes.rows.length > 0) {
        userId = Number(userRes.rows[0].id);
      }
    }

    if (!Number.isFinite(userId)) {
      // Sin userId no podemos asociar la cuenta al usuario de la BD
      try {
        await tx.rollback();
      } catch (_) {}
      return;
    }

    await tx.execute({
      sql: `INSERT INTO accounts (
                    stripe_account_id,
                    user_id,
                    charges_enabled,
                    transfers_enabled,
                    details_submitted
                  ) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(stripe_account_id) DO UPDATE SET
                    user_id = excluded.user_id,
                    charges_enabled = excluded.charges_enabled,
                    transfers_enabled = excluded.transfers_enabled,
                    details_submitted = excluded.details_submitted`,
      args: [
        stripeAccountId,
        userId,
        chargesEnabled ? 1 : 0,
        transfersEnabled ? 1 : 0,
        detailsSubmitted ? 1 : 0,
      ],
    });

    if (onboardingComplete) {
      await tx.execute({
        sql: `UPDATE users
                      SET stripe_account = CASE
                            WHEN stripe_account IS NULL OR stripe_account = ? THEN ?
                            ELSE stripe_account
                          END,
                          onboarding_ended = 1
                      WHERE id = ?`,
        args: [stripeAccountId, stripeAccountId, userId],
      });
    } else {
      await tx.execute({
        sql: `UPDATE users
                      SET onboarding_ended = 0
                      WHERE id = ? AND onboarding_ended != 1`,
        args: [userId],
      });
    }

    await tx.commit();
  } catch (error) {
    console.error("handleAccountUpdated error:", error);
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw error;
  }
}

export const methods = {
  createEvent,
};
