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


    const result = await database.execute({
        sql: "INSERT INTO events (event_id, data, source, status) VALUES (?, ?, ?, ?)",
        args: [req.body.id, data, source, status[1]]
    });

    try {
        if(source === "stripe"){
            await handleStripeEvent(req, res);
        }
    } catch (error) {
        await database.execute({
            sql: "UPDATE events SET status = ?, processing_errors = ? WHERE event_id = ?",
            args: [status[3], error.message, req.body.id]
        });
    }
    finally{
        await database.execute({
            sql: "UPDATE events SET status = ? WHERE event_id = ?",
            args: [status[2], req.body.id]
        });
    }
    
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
        await handleCheckoutSessionCompleted(jsonData.data)
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
}
async function handleCustomerDeleted(jsonData){
    
}
async function handleChargeSucceeded(jsonData){
    
}
async function handlePaymentIntentCreated(jsonData){
    const paymentIntent = jsonData.object;
    console.log(paymentIntent)
    console.log("Entro en el payment intent created")
    let payment_id = paymentIntent.id;
    console.log(payment_id)
    const result = await database.execute({
        sql: "INSERT INTO payment_intents (amount, currency, destination_account, state, description, sender_account, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [paymentIntent.amount, paymentIntent.currency, paymentIntent.transfer_data.destination, paymentIntent.status, paymentIntent.description, paymentIntent.customer, payment_id]
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
async function handleCheckoutSessionCompleted(jsonData){
    let checkout_session = jsonData.object;
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
