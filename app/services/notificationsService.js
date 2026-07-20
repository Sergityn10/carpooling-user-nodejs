import jsonwebtoken from "jsonwebtoken";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

const NOTIFICATIONS_ORIGIN = (
  process.env.NOTIFICATIONS_ORIGIN || "http://localhost:3004"
).replace(/\/$/, "");

function generateServiceToken() {
  return jsonwebtoken.sign(
    { service: "carpooling-user", type: "service" },
    PRIVATE_KEY,
    { expiresIn: "5m", algorithm: JWT_ALGORITHM },
  );
}

// --- Emails ---

async function sendEmail({ to, subject, html, text, cc, bcc, replyTo }) {
  try {
    const response = await fetch(`${NOTIFICATIONS_ORIGIN}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html, text, cc, bcc, replyTo }),
    });
    if (!response.ok) {
      console.error(
        `[notificationsService] sendEmail ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendEmail error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function sendTemplateEmail({ to, template, data, cc, bcc, replyTo }) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/emails/send/template`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, template, data, cc, bcc, replyTo }),
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] sendTemplateEmail ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendTemplateEmail error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function sendSuggestionEmail({
  companyName,
  companyEmail,
  userName,
  userEmail,
  suggestionId,
  adminUrl,
  website,
}) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/emails/send/suggestion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyEmail,
          userName,
          userEmail,
          suggestionId,
          adminUrl,
          website,
        }),
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] sendSuggestionEmail ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendSuggestionEmail error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function sendBatchEmails(emails) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/emails/send/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] sendBatchEmails ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendBatchEmails error:",
      error?.message ?? error,
    );
    return null;
  }
}

// --- Push Notifications ---

async function sendPush({ token, title, body, data, priority, channelId, badge }) {
  try {
    const response = await fetch(`${NOTIFICATIONS_ORIGIN}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, title, body, data, priority, channelId, badge }),
    });
    if (!response.ok) {
      console.error(
        `[notificationsService] sendPush ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendPush error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function sendMulticastPush({
  tokens,
  title,
  body,
  data,
  priority,
  channelId,
  badge,
}) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/push/send/multicast`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens,
          title,
          body,
          data,
          priority,
          channelId,
          badge,
        }),
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] sendMulticastPush ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendMulticastPush error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function sendPushToUser({
  userId,
  title,
  body,
  data,
  priority,
  channelId,
  badge,
}) {
  try {
    const response = await fetch(`${NOTIFICATIONS_ORIGIN}/api/push/send/user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        title,
        body,
        data,
        priority,
        channelId,
        badge,
      }),
    });
    if (!response.ok) {
      console.error(
        `[notificationsService] sendPushToUser ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendPushToUser error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function sendPushToTopic({ topic, title, body, data, priority }) {
  try {
    const response = await fetch(`${NOTIFICATIONS_ORIGIN}/api/push/send/topic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, title, body, data, priority }),
    });
    if (!response.ok) {
      console.error(
        `[notificationsService] sendPushToTopic ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] sendPushToTopic error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function subscribeToTopic({ tokens, topic }) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/push/topic/subscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, topic }),
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] subscribeToTopic ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] subscribeToTopic error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function unsubscribeFromTopic({ tokens, topic }) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/push/topic/unsubscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, topic }),
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] unsubscribeFromTopic ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] unsubscribeFromTopic error:",
      error?.message ?? error,
    );
    return null;
  }
}

// --- Device Tokens (require user JWT) ---

async function registerDeviceToken(userToken, { token, platform, deviceId, deviceName }) {
  try {
    const response = await fetch(`${NOTIFICATIONS_ORIGIN}/api/device-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ token, platform, deviceId, deviceName }),
    });
    if (!response.ok) {
      console.error(
        `[notificationsService] registerDeviceToken ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] registerDeviceToken error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function listMyDevices(userToken) {
  try {
    const response = await fetch(
      `${NOTIFICATIONS_ORIGIN}/api/device-tokens/me`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      },
    );
    if (!response.ok) {
      console.error(
        `[notificationsService] listMyDevices ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] listMyDevices error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function deleteDeviceToken(userToken, { token, deviceId }) {
  try {
    const response = await fetch(`${NOTIFICATIONS_ORIGIN}/api/device-tokens`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ token, deviceId }),
    });
    if (!response.ok) {
      console.error(
        `[notificationsService] deleteDeviceToken ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(
      "[notificationsService] deleteDeviceToken error:",
      error?.message ?? error,
    );
    return null;
  }
}

export const notificationsService = {
  sendEmail,
  sendTemplateEmail,
  sendSuggestionEmail,
  sendBatchEmails,
  sendPush,
  sendMulticastPush,
  sendPushToUser,
  sendPushToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
  registerDeviceToken,
  listMyDevices,
  deleteDeviceToken,
};
