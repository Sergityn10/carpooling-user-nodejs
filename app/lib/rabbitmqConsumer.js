import amqp from "amqplib";
import dotenv from "dotenv";
dotenv.config();

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ?? "amqp://carpooling:carpooling123@localhost:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE ?? "carpooling_events";
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
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

    console.log("[rabbitmq-consumer] Connected to exchange:", EXCHANGE_NAME);

    connection.on("close", () => {
      console.warn("[rabbitmq-consumer] Connection closed. Reconnecting...");
      connection = null;
      channel = null;
      isConnecting = false;
      setTimeout(connect, RECONNECT_INTERVAL_MS);
    });

    connection.on("error", (err) => {
      console.error("[rabbitmq-consumer] Connection error:", err?.message);
    });

    isConnecting = false;
  } catch (error) {
    console.error("[rabbitmq-consumer] Failed to connect:", error?.message);
    isConnecting = false;
    setTimeout(connect, RECONNECT_INTERVAL_MS);
  }
}

async function subscribe(pattern, handler) {
  if (!channel) {
    await connect();
    if (!channel) {
      console.error(
        `[rabbitmq-consumer] Cannot subscribe to "${pattern}": no channel`,
      );
      return;
    }
  }

  const { queue } = await channel.assertQueue("", { exclusive: true });
  await channel.bindQueue(queue, EXCHANGE_NAME, pattern);

  console.log(
    `[rabbitmq-consumer] Subscribed to pattern "${pattern}" on queue "${queue}"`,
  );

  channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const parsed = JSON.parse(msg.content.toString());
      console.log(
        `[rabbitmq-consumer] Received event: ${parsed.event}`,
      );
      await handler(parsed);
      channel.ack(msg);
    } catch (error) {
      console.error(
        `[rabbitmq-consumer] Error processing message:`,
        error?.message ?? error,
      );
      channel.nack(msg, false, false);
    }
  });
}

export default { connect, subscribe };
