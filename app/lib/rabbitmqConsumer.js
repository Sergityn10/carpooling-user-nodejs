import amqp from "amqplib";
import dotenv from "dotenv";
dotenv.config();

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ?? "amqp://carpooling:carpooling123@localhost:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE ?? "carpooling_events";
const APP_CONSUMER_QUEUE =
  process.env.RABBITMQ_USER_QUEUE ?? "carpooling_user_events_queue";
const RECONNECT_INTERVAL_MS = 5000;

let connection = null;
let channel = null;
let isConnecting = false;
let pendingConnection = null;
let isExplicitClose = false;
let consumerTag = null;

// Map de patrón -> Set de handlers
const subscriptions = new Map();

function matchesRoutingKey(pattern, routingKey) {
  if (!pattern || !routingKey) return false;
  if (pattern === routingKey) return true;
  const regexStr =
    "^" +
    pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, "[^.]+")
      .replace(/#/g, ".*") +
    "$";
  return new RegExp(regexStr).test(routingKey);
}

async function setupConsumer() {
  if (!channel) return;

  await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
  await channel.assertQueue(APP_CONSUMER_QUEUE, { durable: true });

  // Re-bind all registered patterns to the durable queue
  for (const pattern of subscriptions.keys()) {
    await channel.bindQueue(APP_CONSUMER_QUEUE, EXCHANGE_NAME, pattern);
    console.log(
      `[rabbitmq-consumer] Bound queue "${APP_CONSUMER_QUEUE}" to pattern "${pattern}"`,
    );
  }

  // Consume from durable queue with ack/nack
  const { consumerTag: tag } = await channel.consume(
    APP_CONSUMER_QUEUE,
    async (msg) => {
      if (!msg) return;

      const routingKey = msg.fields?.routingKey ?? "";
      let parsed;
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch (parseErr) {
        console.error(
          `[rabbitmq-consumer] Invalid JSON payload for "${routingKey}":`,
          parseErr?.message ?? parseErr,
        );
        channel.ack(msg);
        return;
      }

      console.log(
        `[rabbitmq-consumer] Received event "${routingKey}" (message event: ${parsed?.event ?? "n/a"})`,
      );

      let handled = false;
      let lastError = null;

      try {
        for (const [pattern, handlers] of subscriptions.entries()) {
          if (matchesRoutingKey(pattern, routingKey)) {
            for (const handler of handlers) {
              handled = true;
              await handler(parsed);
            }
          }
        }

        channel.ack(msg);
      } catch (err) {
        console.error(
          `[rabbitmq-consumer] Error processing message "${routingKey}":`,
          err?.message ?? err,
        );
        // Descartar para evitar loops infinitos si no hay DLQ configurada
        channel.nack(msg, false, false);
      }
    },
  );

  consumerTag = tag;
}

async function connect() {
  if (isExplicitClose) return null;
  if (isConnecting && pendingConnection) {
    return pendingConnection;
  }
  if (channel) {
    return channel;
  }
  isConnecting = true;

  pendingConnection = (async () => {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      console.log(
        `[rabbitmq-consumer] Connected to RabbitMQ exchange "${EXCHANGE_NAME}"`,
      );

      await setupConsumer();

      connection.on("close", () => {
        if (isExplicitClose) return;
        console.warn("[rabbitmq-consumer] Connection closed. Reconnecting...");
        connection = null;
        channel = null;
        consumerTag = null;
        isConnecting = false;
        pendingConnection = null;
        setTimeout(connect, RECONNECT_INTERVAL_MS);
      });

      connection.on("error", (err) => {
        if (isExplicitClose) return;
        console.error(
          "[rabbitmq-consumer] Connection error:",
          err?.message ?? err,
        );
      });

      return channel;
    } catch (error) {
      if (isExplicitClose) return null;
      console.error(
        "[rabbitmq-consumer] Failed to connect:",
        error?.message ?? error,
        `Retrying in ${RECONNECT_INTERVAL_MS}ms...`,
      );
      connection = null;
      channel = null;
      consumerTag = null;
      pendingConnection = null;
      setTimeout(connect, RECONNECT_INTERVAL_MS);
      return null;
    } finally {
      isConnecting = false;
    }
  })();

  return pendingConnection;
}

async function subscribe(pattern, handler) {
  if (!subscriptions.has(pattern)) {
    subscriptions.set(pattern, new Set());
  }
  subscriptions.get(pattern).add(handler);

  const ch = await connect();
  if (ch) {
    try {
      await ch.bindQueue(APP_CONSUMER_QUEUE, EXCHANGE_NAME, pattern);
      console.log(
        `[rabbitmq-consumer] Subscribed to pattern "${pattern}" on queue "${APP_CONSUMER_QUEUE}"`,
      );
    } catch (e) {
      console.error(
        `[rabbitmq-consumer] Failed to bind pattern "${pattern}":`,
        e?.message ?? e,
      );
    }
  } else {
    console.log(
      `[rabbitmq-consumer] Subscription registered for "${pattern}" (awaiting connection)`,
    );
  }
}

async function close() {
  isExplicitClose = true;
  try {
    if (pendingConnection) {
      await pendingConnection.catch(() => {});
    }
    if (channel) {
      const ch = channel;
      channel = null;
      await ch.close().catch(() => {});
    }
    if (connection) {
      const conn = connection;
      connection = null;
      await conn.close().catch(() => {});
    }
  } catch (_e) {}
}

export default { connect, subscribe, close, matchesRoutingKey };
export { matchesRoutingKey, close };
