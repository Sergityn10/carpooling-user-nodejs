import rabbitmq from "../lib/rabbitmq.js";

async function userRegistered(userId, email, authMethod, role) {
  await rabbitmq.publish("user.registered", {
    user_id: userId,
    email,
    auth_method: authMethod,
    role,
  });
}

async function userLogin(userId, email, role) {
  await rabbitmq.publish("user.login", {
    user_id: userId,
    email,
    role,
  });
}

async function userUpdated(userId, fields) {
  await rabbitmq.publish("user.updated", {
    user_id: userId,
    ...fields,
  });
}

async function userDeleted(userId, byAdmin = false) {
  await rabbitmq.publish("user.deleted", {
    user_id: userId,
    deleted_by: byAdmin ? "admin" : "self",
  });
}

async function carCreated(carId, userId) {
  await rabbitmq.publish("car.created", {
    car_id: carId,
    user_id: userId,
  });
}

async function carUpdated(carId, fields) {
  await rabbitmq.publish("car.updated", {
    car_id: carId,
    ...fields,
  });
}

async function carDeleted(carId, userId) {
  await rabbitmq.publish("car.deleted", {
    car_id: carId,
    user_id: userId,
  });
}

async function platformEventCreated(eventId, name, companyId, uniqueCode) {
  await rabbitmq.publish("platform_event.created", {
    event_id: eventId,
    name,
    company_id: companyId,
    unique_code: uniqueCode,
  });
}

async function platformEventUpdated(eventId, fields) {
  await rabbitmq.publish("platform_event.updated", {
    event_id: eventId,
    ...fields,
  });
}

async function platformEventDeleted(eventId) {
  await rabbitmq.publish("platform_event.deleted", {
    event_id: eventId,
  });
}

async function platformEventJoined(eventId, userId) {
  await rabbitmq.publish("platform_event.joined", {
    event_id: eventId,
    user_id: userId,
  });
}

async function platformEventLeft(eventId, userId) {
  await rabbitmq.publish("platform_event.left", {
    event_id: eventId,
    user_id: userId,
  });
}

async function paymentIntentCreated(
  paymentIntentId,
  amount,
  currency,
  state,
  idReserva,
  mappedStatus,
) {
  await rabbitmq.publish("payment_intent.created", {
    payment_intent_id: paymentIntentId,
    amount,
    currency,
    state,
    mapped_status: mappedStatus ?? null,
    id_reserva: idReserva ?? null,
  });
}

async function paymentIntentSucceeded(
  paymentIntentId,
  amount,
  currency,
  payerUserId,
  receiverUserId,
  idReserva,
) {
  await rabbitmq.publish("payment_intent.succeeded", {
    payment_intent_id: paymentIntentId,
    amount,
    currency,
    payer_user_id: payerUserId,
    receiver_user_id: receiverUserId,
    id_reserva: idReserva ?? null,
  });
}

async function paymentIntentFailed(paymentIntentId, idReserva, mappedStatus) {
  await rabbitmq.publish("payment_intent.failed", {
    payment_intent_id: paymentIntentId,
    id_reserva: idReserva ?? null,
    mapped_status: mappedStatus ?? null,
  });
}

async function paymentIntentCaptured(
  paymentIntentId,
  idReserva,
  grossAmountCents,
  currency,
  payerUserId,
  receiverUserId,
  netAmountCents,
  commissionAmountCents,
) {
  await rabbitmq.publish("payment_intent.captured", {
    payment_intent_id: paymentIntentId,
    id_reserva: idReserva ?? null,
    gross_amount_cents: grossAmountCents,
    net_amount_cents: netAmountCents,
    commission_amount_cents: commissionAmountCents,
    currency,
    payer_user_id: payerUserId,
    receiver_user_id: receiverUserId,
  });
}

async function paymentIntentCanceled(paymentIntentId, idReserva, mappedStatus) {
  await rabbitmq.publish("payment_intent.canceled", {
    payment_intent_id: paymentIntentId,
    id_reserva: idReserva ?? null,
    mapped_status: mappedStatus ?? null,
  });
}

async function stripeAccountUpdated(
  userId,
  stripeAccountId,
  chargesEnabled,
  transfersEnabled,
  detailsSubmitted,
  onboardingComplete,
) {
  await rabbitmq.publish("stripe.account.updated", {
    user_id: userId,
    stripe_account_id: stripeAccountId,
    charges_enabled: chargesEnabled,
    transfers_enabled: transfersEnabled,
    details_submitted: detailsSubmitted,
    onboarding_complete: onboardingComplete,
  });
}

async function payoutUpdated(stripePayoutId, status, userId, amount, currency) {
  await rabbitmq.publish("payout.updated", {
    stripe_payout_id: stripePayoutId,
    status,
    user_id: userId,
    amount,
    currency,
  });
}

async function checkoutSessionExpired(idReserva) {
  await rabbitmq.publish("checkout_session.expired", {
    id_reserva: idReserva ?? null,
    mapped_status: "canceled",
  });
}

async function paymentCheckoutCreated(
  idReserva,
  checkoutSessionId,
  checkoutUrl,
  paymentIntentId,
  amount,
  currency,
  status,
) {
  await rabbitmq.publish("payment.checkout.created", {
    id_reserva: idReserva ?? null,
    checkout_session_id: checkoutSessionId,
    checkout_url: checkoutUrl,
    payment_intent_id: paymentIntentId,
    amount,
    currency,
    status,
  });
}

async function enterpriseServiceEventCreated(
  serviceEventId,
  enterpriseId,
  title,
) {
  await rabbitmq.publish("enterprise_service_event.created", {
    service_event_id: serviceEventId,
    enterprise_id: enterpriseId,
    title,
  });
}

async function enterpriseServiceEventUpdated(serviceEventId, fields) {
  await rabbitmq.publish("enterprise_service_event.updated", {
    service_event_id: serviceEventId,
    ...fields,
  });
}

async function enterpriseServiceEventDeleted(serviceEventId) {
  await rabbitmq.publish("enterprise_service_event.deleted", {
    service_event_id: serviceEventId,
  });
}

async function suggestionCreated(
  suggestionId,
  companyName,
  companyEmail,
  website,
  userName,
  userEmail,
) {
  await rabbitmq.publish("suggestion.created", {
    suggestion_id: suggestionId,
    company_name: companyName,
    company_email: companyEmail,
    website: website ?? null,
    user_name: userName ?? null,
    user_email: userEmail ?? null,
  });
}

async function suggestionAccepted(suggestionId, companyId) {
  await rabbitmq.publish("suggestion.accepted", {
    suggestion_id: suggestionId,
    company_id: companyId,
  });
}

export const eventBus = {
  userRegistered,
  userLogin,
  userUpdated,
  userDeleted,
  carCreated,
  carUpdated,
  carDeleted,
  platformEventCreated,
  platformEventUpdated,
  platformEventDeleted,
  platformEventJoined,
  platformEventLeft,
  paymentIntentCreated,
  paymentIntentSucceeded,
  paymentIntentFailed,
  paymentIntentCaptured,
  paymentIntentCanceled,
  stripeAccountUpdated,
  payoutUpdated,
  checkoutSessionExpired,
  paymentCheckoutCreated,
  enterpriseServiceEventCreated,
  enterpriseServiceEventUpdated,
  enterpriseServiceEventDeleted,
  suggestionCreated,
  suggestionAccepted,
};
