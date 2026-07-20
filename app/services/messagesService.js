const MESSAGES_ORIGIN = (
  process.env.MESSAGES_ORIGIN || "http://localhost:4002"
).replace(/\/$/, "");

async function createEventChat(eventId, eventName, adminId, userToken) {
  try {
    const response = await fetch(`${MESSAGES_ORIGIN}/api/chats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: eventName,
        chat_type: "EVENT",
        trip_id: eventId,
        admin_id: adminId,
        participant_ids: [adminId],
      }),
    });
    if (!response.ok) {
      console.error(
        `[messagesService] createEventChat ${response.status}: ${await response.text()}`,
      );
      return null;
    }
    const data = await response.json();
    return data?.chat?.id ?? null;
  } catch (error) {
    console.error(
      "[messagesService] createEventChat error:",
      error?.message ?? error,
    );
    return null;
  }
}

async function joinChat(chatId, userToken) {
  try {
    const response = await fetch(
      `${MESSAGES_ORIGIN}/api/chats/${chatId}/join`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
      },
    );
    if (!response.ok) {
      console.error(
        `[messagesService] joinChat ${response.status}: ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[messagesService] joinChat error:", error?.message ?? error);
    return false;
  }
}

async function leaveChat(chatId, userToken) {
  try {
    const response = await fetch(
      `${MESSAGES_ORIGIN}/api/chats/${chatId}/leave`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
      },
    );
    if (!response.ok) {
      console.error(
        `[messagesService] leaveChat ${response.status}: ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[messagesService] leaveChat error:",
      error?.message ?? error,
    );
    return false;
  }
}

async function deleteChat(chatId, userToken) {
  try {
    const response = await fetch(`${MESSAGES_ORIGIN}/api/chats/${chatId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
    });
    if (!response.ok) {
      console.error(
        `[messagesService] deleteChat ${response.status}: ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[messagesService] deleteChat error:",
      error?.message ?? error,
    );
    return false;
  }
}

export const messagesService = {
  createEventChat,
  joinChat,
  leaveChat,
  deleteChat,
};
