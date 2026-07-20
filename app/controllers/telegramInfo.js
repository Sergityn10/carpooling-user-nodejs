import prisma from "../lib/prisma.js";
import { TelegramInfo } from "../schemas/Telegram/telegramInfo.js";

// Helper: map Prisma row -> API schema shape
function mapRowToSchema(row) {
  return {
    user_id: row.user_id,
    id: Number(row.id),
    telegram_username: row.username_telegram ?? null,
    first_name: row.first_name,
    last_name: row.last_name ?? null,
    chat_id:
      row.chat_id !== null && row.chat_id !== undefined
        ? Number(row.chat_id)
        : null,
  };
}

async function userExists(userId) {
  const result = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return !!result;
}

async function getAll(req, res) {
  try {
    const userId = req.query.user_id ?? req.query.userId ?? null;
    const rows = await prisma.telegramInfo.findMany(
      userId != null ? { where: { user_id: userId } } : undefined,
    );
    const data = rows.map(mapRowToSchema);
    return res.status(200).json({ status: "Success", data });
  } catch (error) {
    console.error("Error fetching telegram_info:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to fetch telegram info" });
  }
}

async function getById(req, res) {
  const { id } = req.params;
  try {
    const row = await prisma.telegramInfo.findUnique({
      where: { id: Number(id) },
    });
    if (!row) {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }
    return res
      .status(200)
      .json({ status: "Success", data: mapRowToSchema(row) });
  } catch (error) {
    console.error("Error fetching telegram_info by id:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to fetch telegram info" });
  }
}

async function create(req, res) {
  const parsed = TelegramInfo.validateTelegramInfoSchema(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const { user_id, id, telegram_username, first_name, last_name, chat_id } =
    parsed.data;

  try {
    // Ensure referenced user exists
    if (!(await userExists(user_id))) {
      return res
        .status(404)
        .json({ status: "Error", message: "User not found" });
    }

    // Ensure telegram_info primary key (id) is unique
    const existing = await prisma.telegramInfo.findUnique({
      where: { id: Number(id) },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        status: "Error",
        message: "Telegram info already exists for this id",
      });
    }

    await prisma.telegramInfo.create({
      data: {
        user_id,
        id: Number(id),
        username_telegram: telegram_username ?? null,
        first_name,
        last_name: last_name ?? null,
        chat_id: chat_id ?? null,
      },
    });

    return res
      .status(201)
      .json({ status: "Success", message: "Telegram info created" });
  } catch (error) {
    console.error("Error creating telegram_info:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to create telegram info" });
  }
}

async function updatePut(req, res) {
  const { id } = req.params;
  const parsed = TelegramInfo.validateTelegramInfoSchema(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const {
    user_id,
    id: bodyId,
    telegram_username,
    first_name,
    last_name,
    chat_id,
  } = parsed.data;

  if (String(bodyId) !== String(id)) {
    return res
      .status(400)
      .json({ status: "Error", message: "Body id must match URL id" });
  }

  try {
    const existing = await prisma.telegramInfo.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }

    if (!(await userExists(user_id))) {
      return res
        .status(404)
        .json({ status: "Error", message: "User not found" });
    }

    await prisma.telegramInfo.update({
      where: { id: Number(id) },
      data: {
        user_id,
        username_telegram: telegram_username ?? null,
        first_name,
        last_name: last_name ?? null,
        chat_id: chat_id ?? null,
      },
    });

    return res
      .status(200)
      .json({ status: "Success", message: "Telegram info updated" });
  } catch (error) {
    console.error("Error updating telegram_info:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to update telegram info" });
  }
}

async function updatePatch(req, res) {
  const { id } = req.params;
  const parsed = TelegramInfo.validateTelegramInfoPartial(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const { user_id, id: bodyId } = parsed.data;

  if (bodyId !== undefined && String(bodyId) !== String(id)) {
    return res.status(400).json({
      status: "Error",
      message: "Body id must match URL id when provided",
    });
  }

  try {
    const existing = await prisma.telegramInfo.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }

    if (user_id !== undefined) {
      if (!(await userExists(user_id))) {
        return res
          .status(404)
          .json({ status: "Error", message: "User not found" });
      }
    }

    const data = {};
    if (user_id !== undefined) data.user_id = user_id;
    if (parsed.data.telegram_username !== undefined)
      data.username_telegram = parsed.data.telegram_username ?? null;
    if (parsed.data.first_name !== undefined)
      data.first_name = parsed.data.first_name;
    if (parsed.data.last_name !== undefined)
      data.last_name = parsed.data.last_name ?? null;
    if (parsed.data.chat_id !== undefined)
      data.chat_id = parsed.data.chat_id ?? null;

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ status: "Error", message: "No fields provided to update" });
    }

    await prisma.telegramInfo.update({
      where: { id: Number(id) },
      data,
    });

    return res
      .status(200)
      .json({ status: "Success", message: "Telegram info updated" });
  } catch (error) {
    console.error("Error partially updating telegram_info:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to update telegram info" });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  try {
    await prisma.telegramInfo.delete({ where: { id: Number(id) } });
    return res
      .status(200)
      .json({ status: "Success", message: "Telegram info deleted" });
  } catch (error) {
    if (error?.code === "P2025") {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }
    console.error("Error deleting telegram_info:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Failed to delete telegram info" });
  }
}

async function bulkCreate(req, res) {
  const payload = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.items)
      ? req.body.items
      : null;
  if (!payload) {
    return res.status(400).json({
      status: "Error",
      message:
        "Provide an array of telegram info items in the request body or under 'items'",
    });
  }

  const results = {
    inserted: 0,
    skippedExisting: 0,
    invalid: 0,
    invalidItems: [],
    errors: 0,
  };

  try {
    for (let index = 0; index < payload.length; index++) {
      const item = payload[index];
      try {
        const parsed = TelegramInfo.validateTelegramInfoSchema(item);
        if (!parsed.success) {
          results.invalid++;
          results.invalidItems.push({
            index,
            reason: JSON.parse(parsed.error.message),
          });
          continue;
        }
        const {
          user_id,
          id,
          telegram_username,
          first_name,
          last_name,
          chat_id,
        } = parsed.data;

        if (!(await userExists(user_id))) {
          results.invalid++;
          results.invalidItems.push({ index, reason: "User not found" });
          continue;
        }

        const existing = await prisma.telegramInfo.findUnique({
          where: { id: Number(id) },
          select: { id: true },
        });
        if (existing) {
          results.skippedExisting++;
          continue;
        }

        await prisma.telegramInfo.create({
          data: {
            user_id,
            id: Number(id),
            username_telegram: telegram_username ?? null,
            first_name,
            last_name: last_name ?? null,
            chat_id: chat_id ?? null,
          },
        });
        results.inserted++;
      } catch (e) {
        console.error("Error processing bulk item", index, e);
        results.errors++;
      }
    }

    return res.status(207).json({ status: "Multi-Status", results });
  } catch (error) {
    console.error("Error in bulk creating telegram_info:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to bulk create telegram info",
    });
  }
}

export const TelegramInfoServices = {
  getAll,
  getById,
  create,
  updatePut,
  updatePatch,
  remove,
  bulkCreate,
};
