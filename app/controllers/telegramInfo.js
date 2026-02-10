import database from "../database.js";
import { TelegramInfo } from "../schemas/Telegram/telegramInfo.js";

// Helper: map DB row -> API schema shape
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
  const result = await database.execute({
    sql: "SELECT 1 FROM users WHERE id = ? LIMIT 1",
    args: [userId],
  });
  return (result.rows ?? []).length > 0;
}

async function getAll(req, res) {
  try {
    const userId = req.query.user_id ?? req.query.userId ?? null;
    const result = await database.execute(
      userId != null
        ? {
            sql: "SELECT * FROM telegram_info WHERE user_id = ?",
            args: [userId],
          }
        : {
            sql: "SELECT * FROM telegram_info",
            args: [],
          },
    );
    const data = (result.rows ?? []).map(mapRowToSchema);
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
    const result = await database.execute({
      sql: "SELECT * FROM telegram_info WHERE id = ?",
      args: [id],
    });
    const rows = result.rows ?? [];
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }
    return res
      .status(200)
      .json({ status: "Success", data: mapRowToSchema(rows[0]) });
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
    const existing = await database.execute({
      sql: "SELECT id FROM telegram_info WHERE id = ?",
      args: [id],
    });
    if ((existing.rows ?? []).length > 0) {
      return res
        .status(409)
        .json({
          status: "Error",
          message: "Telegram info already exists for this id",
        });
    }

    const result = await database.execute({
      sql: "INSERT INTO telegram_info (user_id, id, username_telegram, first_name, last_name, chat_id) VALUES (?, ?, ?, ?, ?, ?)",
      args: [
        user_id,
        id,
        telegram_username ?? null,
        first_name,
        last_name ?? null,
        chat_id ?? null,
      ],
    });

    if (!result || result.rowsAffected === 0) {
      return res
        .status(500)
        .json({ status: "Error", message: "Failed to create telegram info" });
    }

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
    const existing = await database.execute({
      sql: "SELECT * FROM telegram_info WHERE id = ?",
      args: [id],
    });
    if ((existing.rows ?? []).length === 0) {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }

    if (!(await userExists(user_id))) {
      return res
        .status(404)
        .json({ status: "Error", message: "User not found" });
    }

    const result = await database.execute({
      sql: "UPDATE telegram_info SET user_id = ?, username_telegram = ?, first_name = ?, last_name = ?, chat_id = ? WHERE id = ?",
      args: [
        user_id,
        telegram_username ?? null,
        first_name,
        last_name ?? null,
        chat_id ?? null,
        id,
      ],
    });

    if (!result || result.rowsAffected === 0) {
      return res
        .status(500)
        .json({ status: "Error", message: "Failed to update telegram info" });
    }

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
    return res
      .status(400)
      .json({
        status: "Error",
        message: "Body id must match URL id when provided",
      });
  }

  try {
    const existingRows = await database.execute({
      sql: "SELECT * FROM telegram_info WHERE id = ?",
      args: [id],
    });
    if ((existingRows.rows ?? []).length === 0) {
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

    const allowedKeys = [
      "user_id",
      "telegram_username",
      "first_name",
      "last_name",
      "chat_id",
    ];
    const fields = [];
    const values = [];

    for (const k of allowedKeys) {
      if (parsed.data[k] === undefined) continue;
      const col = k === "telegram_username" ? "username_telegram" : k;
      fields.push(`${col} = ?`);
      values.push(parsed.data[k] ?? null);
    }

    if (fields.length === 0) {
      return res
        .status(400)
        .json({ status: "Error", message: "No fields provided to update" });
    }

    values.push(id);

    const result = await database.execute({
      sql: `UPDATE telegram_info SET ${fields.join(", ")} WHERE id = ?`,
      args: values,
    });

    if (!result || result.rowsAffected === 0) {
      return res
        .status(500)
        .json({ status: "Error", message: "Failed to update telegram info" });
    }

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
    const result = await database.execute({
      sql: "DELETE FROM telegram_info WHERE id = ?",
      args: [id],
    });
    if (!result || result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ status: "Error", message: "Telegram info not found" });
    }
    return res
      .status(200)
      .json({ status: "Success", message: "Telegram info deleted" });
  } catch (error) {
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
    return res
      .status(400)
      .json({
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

        const existing = await database.execute({
          sql: "SELECT id FROM telegram_info WHERE id = ?",
          args: [id],
        });
        if ((existing.rows ?? []).length > 0) {
          results.skippedExisting++;
          continue;
        }

        const insert = await database.execute({
          sql: "INSERT INTO telegram_info (user_id, id, username_telegram, first_name, last_name, chat_id) VALUES (?, ?, ?, ?, ?, ?)",
          args: [
            user_id,
            id,
            telegram_username ?? null,
            first_name,
            last_name ?? null,
            chat_id ?? null,
          ],
        });

        if ((insert?.rowsAffected ?? 0) > 0) {
          results.inserted++;
        }
      } catch (e) {
        console.error("Error processing bulk item", index, e);
        results.errors++;
      }
    }

    return res.status(207).json({ status: "Multi-Status", results });
  } catch (error) {
    console.error("Error in bulk creating telegram_info:", error);
    return res
      .status(500)
      .json({
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
