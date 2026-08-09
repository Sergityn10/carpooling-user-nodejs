import amqp from "amqplib";
import dotenv from "dotenv";
dotenv.config();

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ?? "amqp://carpooling:carpooling123@localhost:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE ?? "carpooling_events";
const EXCHANGE_TYPE = "topic";
const RECONNECT_INTERVAL_MS = 5000;

let connection = null;
let channel = null;
let isConnecting = false;

async function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
      durable: true,
    });

    console.log("[rabbitmq] Connected and exchange asserted:", EXCHANGE_NAME);

    connection.on("close", () => {
      console.warn("[rabbitmq] Connection closed. Reconnecting...");
      connection = null;
      channel = null;
      setTimeout(connect, RECONNECT_INTERVAL_MS);
    });

    connection.on("error", (err) => {
      console.error("[rabbitmq] Connection error:", err?.message ?? err);
    });
  } catch (error) {
    console.error(
      "[rabbitmq] Failed to connect:",
      error?.message ?? error,
      `Retrying in ${RECONNECT_INTERVAL_MS}ms...`,
    );
    connection = null;
    channel = null;
    setTimeout(connect, RECONNECT_INTERVAL_MS);
  } finally {
    isConnecting = false;
  }
}

async function getChannel() {
  if (!channel) {
    await connect();
  }
  return channel;
}

async function publish(routingKey, payload) {
  try {
    const ch = await getChannel();
    if (!ch) {
      console.warn("[rabbitmq] No channel available, skipping publish");
      return false;
    }
    const message = Buffer.from(
      JSON.stringify({
        event: routingKey,
        source: "carpooling-user",
        timestamp: new Date().toISOString(),
        data: payload,
      }),
    );
    return ch.publish(EXCHANGE_NAME, routingKey, message, {
      persistent: true,
      contentType: "application/json",
    });
  } catch (error) {
    console.error(
      `[rabbitmq] Publish error for "${routingKey}":`,
      error?.message ?? error,
    );
    return false;
  }
}

connect();

export default { publish, connect, getChannel };
export { EXCHANGE_NAME };
