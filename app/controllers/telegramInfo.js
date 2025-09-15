import { database } from "../database.js";
import { TelegramInfo } from "../schemas/Telegram/telegramInfo.js";

// Helper: map DB row -> API schema shape
function mapRowToSchema(row) {
  return {
    user: row.username,
    id: Number(row.id),
    telegram_username: row.username_telegram ?? null,
    first_name: row.first_name,
    last_name: row.last_name ?? null,
    chat_id: row.chat_id !== null && row.chat_id !== undefined ? Number(row.chat_id) : null,
  };
}

async function userExists(connection, username) {
  const result = await connection.query("SELECT 1 FROM users WHERE username = ? LIMIT 1", [username]);
  return result[0].length > 0;
}

async function getAll(req, res) {
  try {
    const connection = await database.getConnection();
    const { username } = req.query;
    const [rows] = username
      ? await connection.query("SELECT * FROM telegram_info WHERE username = ?", [username])
      : await connection.query("SELECT * FROM telegram_info");
    const data = rows.map(mapRowToSchema);
    return res.status(200).json({ status: "Success", data });
  } catch (error) {
    console.error("Error fetching telegram_info:", error);
    return res.status(500).json({ status: "Error", message: "Failed to fetch telegram info" });
  }
}

async function getById(req, res) {
  const { id } = req.params;
  try {
    const connection = await database.getConnection();
    const [rows] = await connection.query("SELECT * FROM telegram_info WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ status: "Error", message: "Telegram info not found" });
    }
    return res.status(200).json({ status: "Success", data: mapRowToSchema(rows[0]) });
  } catch (error) {
    console.error("Error fetching telegram_info by id:", error);
    return res.status(500).json({ status: "Error", message: "Failed to fetch telegram info" });
  }
}

async function create(req, res) {
  const parsed = TelegramInfo.validateTelegramInfoSchema(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const { username, id, telegram_username, first_name, last_name, chat_id } = parsed.data;

  try {
    const connection = await database.getConnection();

    // Ensure referenced user exists
    if (!(await userExists(connection, username))) {
      return res.status(404).json({ status: "Error", message: "User not found" });
    }

    // Ensure telegram_info primary key (id) is unique
    const [existing] = await connection.query("SELECT id FROM telegram_info WHERE id = ?", [id]);
    if (existing.length > 0) {
      return res.status(409).json({ status: "Error", message: "Telegram info already exists for this id" });
    }

    const [result] = await connection.query(
      "INSERT INTO telegram_info (username, id, username_telegram, first_name, last_name, chat_id) VALUES (?, ?, ?, ?, ?, ?)",
      [username, id, telegram_username ?? null, first_name, last_name ?? null, chat_id ?? null]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ status: "Error", message: "Failed to create telegram info" });
    }

    return res.status(201).json({ status: "Success", message: "Telegram info created" });
  } catch (error) {
    console.error("Error creating telegram_info:", error);
    return res.status(500).json({ status: "Error", message: "Failed to create telegram info" });
  }
}

async function updatePut(req, res) {
  const { id } = req.params;
  const parsed = TelegramInfo.validateTelegramInfoSchema(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const { username, id: bodyId, telegram_username, first_name, last_name, chat_id } = parsed.data;

  if (String(bodyId) !== String(id)) {
    return res.status(400).json({ status: "Error", message: "Body id must match URL id" });
  }

  try {
    const connection = await database.getConnection();

    const [existing] = await connection.query("SELECT * FROM telegram_info WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ status: "Error", message: "Telegram info not found" });
    }

    if (!(await userExists(connection, username))) {
      return res.status(404).json({ status: "Error", message: "User not found" });
    }

    const [result] = await connection.query(
      "UPDATE telegram_info SET username = ?, username_telegram = ?, first_name = ?, last_name = ?, chat_id = ? WHERE id = ?",
      [username, telegram_username ?? null, first_name, last_name ?? null, chat_id ?? null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ status: "Error", message: "Failed to update telegram info" });
    }

    return res.status(200).json({ status: "Success", message: "Telegram info updated" });
  } catch (error) {
    console.error("Error updating telegram_info:", error);
    return res.status(500).json({ status: "Error", message: "Failed to update telegram info" });
  }
}

async function updatePatch(req, res) {
  const { id } = req.params;
  const parsed = TelegramInfo.validateTelegramInfoPartial(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: "Error", message: JSON.parse(parsed.error.message) });
  }

  const { username, id: bodyId, telegram_username, first_name, last_name, chat_id } = parsed.data;

  if (bodyId !== undefined && String(bodyId) !== String(id)) {
    return res.status(400).json({ status: "Error", message: "Body id must match URL id when provided" });
  }

  try {
    const connection = await database.getConnection();

    const [existingRows] = await connection.query("SELECT * FROM telegram_info WHERE id = ?", [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ status: "Error", message: "Telegram info not found" });
    }

    // Build dynamic update
    const fields = [];
    const values = [];

    if (username !== undefined) {
      if (!(await userExists(connection, username))) {
        return res.status(404).json({ status: "Error", message: "User not found" });
      }
    }


    if (fields.length === 0) {
      return res.status(400).json({ status: "Error", message: "No fields provided to update" });
    }

    for (const key in parsed.data) {
        // We use backticks for column names to avoid conflicts with reserved words, just in case
        fields.push(`\`${key}\` = ?`);
        values.push(parsed.data[key]);
    }

    values.push(id);

    const sql = `UPDATE telegram_info SET ${fields.join(", ")} WHERE id = ?`;
    const [result] = await connection.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(500).json({ status: "Error", message: "Failed to update telegram info" });
    }

    return res.status(200).json({ status: "Success", message: "Telegram info updated" });
  } catch (error) {
    console.error("Error partially updating telegram_info:", error);
    return res.status(500).json({ status: "Error", message: "Failed to update telegram info" });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  try {
    const connection = await database.getConnection();
    const [result] = await connection.query("DELETE FROM telegram_info WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "Error", message: "Telegram info not found" });
    }
    return res.status(200).json({ status: "Success", message: "Telegram info deleted" });
  } catch (error) {
    console.error("Error deleting telegram_info:", error);
    return res.status(500).json({ status: "Error", message: "Failed to delete telegram info" });
  }
}

async function bulkCreate(req, res) {
  const payload = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : null;
  if (!payload) {
    return res.status(400).json({ status: "Error", message: "Provide an array of telegram info items in the request body or under 'items'" });
  }

  const results = {
    inserted: 0,
    skippedExisting: 0,
    invalid: 0,
    invalidItems: [],
    errors: 0,
  };

  try {
    const connection = await database.getConnection();

    for (let index = 0; index < payload.length; index++) {
      const item = payload[index];
      try {
        const parsed = TelegramInfo.validateTelegramInfoSchema(item);
        if (!parsed.success) {
          results.invalid++;
          results.invalidItems.push({ index, reason: JSON.parse(parsed.error.message) });
          continue;
        }
        const { user, id, telegram_username, first_name, last_name, chat_id } = parsed.data;

        if (!(await userExists(connection, user))) {
          results.invalid++;
          results.invalidItems.push({ index, reason: "User not found" });
          continue;
        }

        const [existing] = await connection.query("SELECT id FROM telegram_info WHERE id = ?", [id]);
        if (existing.length > 0) {
          results.skippedExisting++;
          continue;
        }

        const [insert] = await connection.query(
          "INSERT INTO telegram_info (username, id, username_telegram, first_name, last_name, chat_id) VALUES (?, ?, ?, ?, ?, ?)",
          [user, id, telegram_username ?? null, first_name, last_name ?? null, chat_id ?? null]
        );

        if (insert.affectedRows > 0) {
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
    return res.status(500).json({ status: "Error", message: "Failed to bulk create telegram info" });
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
