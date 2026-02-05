import dotenv from "dotenv";
dotenv.config();
import { UserSchemas } from "../schemas/user.js";
import { authorization } from "../middlewares/authorization.js";
import database from "../database.js";
import { methods as utils } from "../utils/hashing.js";
import { methods as cryptoUtils } from "../utils/crypto.js";

function isNoSuchTableError(error, tableName) {
  const expected = `no such table: ${String(tableName ?? "").toLowerCase()}`;
  const msg = String(
    error?.message ??
      error?.cause?.message ??
      error?.cause?.proto?.message ??
      "",
  ).toLowerCase();
  return msg.includes(expected);
}

function isNoSuchColumnError(error, columnName) {
  const expected = `no such column: ${String(columnName ?? "").toLowerCase()}`;
  const msg = String(
    error?.message ??
      error?.cause?.message ??
      error?.cause?.proto?.message ??
      "",
  ).toLowerCase();
  return msg.includes(expected);
}

function escapeSqliteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function findFirstExistingColumn(tx, tableName, preferredLowerNames) {
  let tableInfo;
  try {
    tableInfo = await tx.execute({
      sql: `PRAGMA table_info(${escapeSqliteIdentifier(tableName)})`,
      args: [],
    });
  } catch (error) {
    if (isNoSuchTableError(error, tableName)) return null;
    throw error;
  }

  const cols = (tableInfo.rows ?? [])
    .map((r) => ({
      name: r?.name,
      lower: String(r?.name ?? "").toLowerCase(),
    }))
    .filter((c) => c.lower.length > 0);

  const selectedLower = (preferredLowerNames ?? []).find((p) =>
    cols.some((c) => c.lower === p),
  );
  return cols.find((c) => c.lower === selectedLower)?.name ?? null;
}

async function countUserViajes(username) {
  if (!username) return 0;

  let tableInfo;
  try {
    tableInfo = await database.execute({
      sql: "PRAGMA table_info(trayectos)",
      args: [],
    });
  } catch (error) {
    if (isNoSuchTableError(error, "trayectos")) return 0;
    throw error;
  }

  const cols = (tableInfo.rows ?? [])
    .map((r) => ({
      name: r?.name,
      lower: String(r?.name ?? "").toLowerCase(),
    }))
    .filter((c) => c.lower.length > 0);

  const preferred = [
    "username",
    "user",
    "usuario",
    "username_user",
    "username_trayect",
    "username_driver",
    "driver",
    "conductor",
    "owner",
    "creator",
    "created_by",
  ];

  const selectedLower = preferred.find((p) => cols.some((c) => c.lower === p));
  const selected = cols.find((c) => c.lower === selectedLower)?.name;
  if (!selected) return 0;

  const countRes = await database.execute({
    sql: `SELECT COUNT(1) AS c FROM trayectos WHERE ${escapeSqliteIdentifier(selected)} = ?`,
    args: [username],
  });

  return Number(countRes.rows?.[0]?.c ?? 0);
}

async function deleteAllRowsReferencingUser(tx, username, userId) {
  const maxPasses = 6;
  for (let pass = 0; pass < maxPasses; pass++) {
    const tablesResult = await tx.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      args: [],
    });

    let deletedSomething = false;

    for (const row of tablesResult.rows ?? []) {
      const tableName = row.name;
      if (!tableName || String(tableName).toLowerCase() === "users") continue;

      const quotedTable = escapeSqliteIdentifier(tableName);
      let fkRows;
      try {
        const fkResult = await tx.execute({
          sql: `PRAGMA foreign_key_list(${quotedTable})`,
          args: [],
        });
        fkRows = fkResult.rows ?? [];
      } catch (_e) {
        continue;
      }

      const conditions = [];
      const args = [];

      for (const fk of fkRows) {
        if (String(fk.table ?? "").toLowerCase() !== "users") continue;

        const fromCol = fk.from;
        const toCol = fk.to;
        if (!fromCol || !toCol) continue;

        if (String(toCol).toLowerCase() === "username") {
          conditions.push(`${escapeSqliteIdentifier(fromCol)} = ?`);
          args.push(username);
        } else if (String(toCol).toLowerCase() === "id") {
          if (userId !== undefined && userId !== null) {
            conditions.push(`${escapeSqliteIdentifier(fromCol)} = ?`);
            args.push(userId);
          }
        }
      }

      if (conditions.length === 0) continue;

      try {
        const delRes = await tx.execute({
          sql: `DELETE FROM ${quotedTable} WHERE ${conditions.join(" OR ")}`,
          args,
        });
        if ((delRes?.rowsAffected ?? 0) > 0) {
          deletedSomething = true;
        }
      } catch (_e) {
        // Best-effort cleanup; do not fail the whole deletion here.
      }
    }

    if (!deletedSomething) {
      break;
    }
  }
}

async function updateUserPatch(req, res) {
  const result = UserSchemas.validateUserSchemaPartial(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const { username } = req.params;

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = await authorization.reviseCookie(req);
  if (!findUser || findUser.username !== username) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }

  const { rows } = await database.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username],
  });
  console.log(rows);
  const user = rows[0];
  if (!user) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }

  if (result.data.password) {
    result.data.password = await utils.hashValue(10, result.data.password);
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    const { rows: allRows } = await database.execute({
      sql: "SELECT username, dni FROM users",
      args: [],
    });
    const collision = (allRows ?? []).find((r) => {
      if (!r?.dni) return false;
      const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
      return plain === dniCandidate && String(r.username) !== String(username);
    });
    if (collision) {
      return res
        .status(409)
        .send({ status: "Error", message: "DNI already exists" });
    }
  }

  const updatesEncrypted = cryptoUtils.encryptFields(
    result.data,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );
  result.data = updatesEncrypted;

  const keys = Object.keys(result.data);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
  }
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const args = [...keys.map((k) => result.data[k]), username];
  const updateUserQuery = await database.execute({
    sql: `UPDATE users SET ${setClause} WHERE username = ?`,
    args,
  });
  if (updateUserQuery.rowsAffected === 0) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to update user" });
  }
  return res
    .status(200)
    .send({ status: "Success", message: "User updated successfully" });
}

async function updateMyUserPatch(req, res) {
  const result = UserSchemas.validateUserSchemaPartial(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = req.user;
  console.log(`Actualizando a ${findUser.username}`);
  const resultado = await database.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [findUser.username],
  });
  console.log(resultado);
  const user = resultado.rows[0];
  if (!user) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }

  if (result.data.password) {
    result.data.password = await utils.hashValue(10, result.data.password);
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    const { rows: allRows } = await database.execute({
      sql: "SELECT username, dni FROM users",
      args: [],
    });
    const collision = (allRows ?? []).find((r) => {
      if (!r?.dni) return false;
      const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
      return (
        plain === dniCandidate &&
        String(r.username) !== String(findUser.username)
      );
    });
    if (collision) {
      return res
        .status(409)
        .send({ status: "Error", message: "DNI already exists" });
    }
  }

  const updatesEncrypted = cryptoUtils.encryptFields(
    result.data,
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );
  result.data = updatesEncrypted;

  const keys = Object.keys(result.data);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
  }
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const args = [...keys.map((k) => result.data[k]), findUser.username];
  const updateUserQuery = await database.execute({
    sql: `UPDATE users SET ${setClause} WHERE username = ?`,
    args,
  });
  if (updateUserQuery.rowsAffected === 0) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to update user" });
  }
  return res
    .status(200)
    .send({ status: "Success", message: "User updated successfully" });
}

async function removeUser(req, res) {
  const { username } = req.params;

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = await authorization.reviseCookie(req);
  if (!findUser || findUser.username !== username) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }

  let tx;
  try {
    tx = await database.transaction("write");

    try {
      await tx.execute({
        sql: "PRAGMA foreign_keys = ON",
        args: [],
      });
    } catch (_e) {}

    const { rows: userRows } = await tx.execute({
      sql: "SELECT * FROM users WHERE username = ?",
      args: [username],
    });
    const user = userRows[0];
    if (!user) {
      try {
        await tx.rollback();
      } catch (_e) {}
      return res
        .status(404)
        .send({ status: "Error", message: "User not found" });
    }

    const userId = user.id;

    // Best-effort automatic cascade delete for any table that has FK -> users.
    // This prevents missing a table (and hitting SQLITE_CONSTRAINT) when deleting the user.
    await deleteAllRowsReferencingUser(tx, username, userId);

    try {
      await tx.execute({
        sql: `DELETE FROM payment_intents
                      WHERE sender_account IN (SELECT stripe_account_id FROM accounts WHERE username = ?)`,
        args: [username],
      });
    } catch (error) {
      if (
        !isNoSuchTableError(error, "payment_intents") &&
        !isNoSuchTableError(error, "accounts")
      ) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: `DELETE FROM payment_intents
                      WHERE id_reserva IN (SELECT id_reserva FROM reservas WHERE username = ?)`,
        args: [username],
      });
    } catch (error) {
      if (
        !isNoSuchTableError(error, "payment_intents") &&
        !isNoSuchTableError(error, "reservas") &&
        !isNoSuchColumnError(error, "username")
      ) {
        throw error;
      }
      if (isNoSuchColumnError(error, "username")) {
        await tx.execute({
          sql: `DELETE FROM payment_intents
                        WHERE id_reserva IN (SELECT id_reserva FROM reservas WHERE usuario = ?)`,
          args: [username],
        });
      }
    }

    try {
      const reservasCol = await findFirstExistingColumn(tx, "reservas", [
        "username",
        "user",
        "usuario",
        "username_user",
      ]);

      if (reservasCol) {
        await tx.execute({
          sql: `DELETE FROM reservas WHERE ${escapeSqliteIdentifier(reservasCol)} = ?`,
          args: [username],
        });
      }
    } catch (error) {
      if (!isNoSuchTableError(error, "reservas")) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM comments WHERE username_commentator = ? OR username_trayect = ?",
        args: [username, username],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "comments")) {
        throw error;
      }
    }

    try {
      const trayectosCol = await findFirstExistingColumn(tx, "trayectos", [
        "conductor",
        "driver",
        "username",
        "user",
        "usuario",
        "owner",
        "creator",
        "created_by",
        "username_user",
        "username_driver",
      ]);

      if (trayectosCol) {
        await tx.execute({
          sql: `DELETE FROM trayectos WHERE ${escapeSqliteIdentifier(trayectosCol)} = ?`,
          args: [username],
        });
      }
    } catch (error) {
      if (!isNoSuchTableError(error, "trayectos")) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM telegram_info WHERE username = ?",
        args: [username],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "telegram_info")) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM cars WHERE user = ?",
        args: [username],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "cars")) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM accounts WHERE username = ?",
        args: [username],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "accounts")) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM disponibilidad_semanal WHERE username = ?",
        args: [username],
      });
    } catch (error) {
      if (isNoSuchTableError(error, "disponibilidad_semanal")) {
        // ignore
      } else if (isNoSuchColumnError(error, "username")) {
        await tx.execute({
          sql: "DELETE FROM disponibilidad_semanal WHERE usuario = ?",
          args: [username],
        });
      } else {
        throw error;
      }
    }

    if (userId !== undefined && userId !== null) {
      try {
        await tx.execute({
          sql: "DELETE FROM wallet_payouts WHERE user_id = ?",
          args: [userId],
        });
      } catch (error) {
        if (!isNoSuchTableError(error, "wallet_payouts")) {
          throw error;
        }
      }

      try {
        await tx.execute({
          sql: "DELETE FROM wallet_transactions WHERE user_id = ?",
          args: [userId],
        });
      } catch (error) {
        if (!isNoSuchTableError(error, "wallet_transactions")) {
          throw error;
        }
      }

      try {
        await tx.execute({
          sql: "DELETE FROM wallet_recharges WHERE user_id = ?",
          args: [userId],
        });
      } catch (error) {
        if (!isNoSuchTableError(error, "wallet_recharges")) {
          throw error;
        }
      }

      try {
        await tx.execute({
          sql: "DELETE FROM wallet_accounts WHERE user_id = ?",
          args: [userId],
        });
      } catch (error) {
        if (!isNoSuchTableError(error, "wallet_accounts")) {
          throw error;
        }
      }
    }

    await deleteAllRowsReferencingUser(tx, username, userId);

    const deleteUserQuery = await tx.execute({
      sql: "DELETE FROM users WHERE username = ?",
      args: [username],
    });
    if (deleteUserQuery.rowsAffected === 0) {
      try {
        await tx.rollback();
      } catch (_e) {}
      return res
        .status(500)
        .send({ status: "Error", message: "Failed to delete user" });
    }

    await tx.commit();

    try {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        domain: process.env.ORIGIN,
      });
    } catch (_e) {}

    return res
      .status(200)
      .send({ status: "Success", message: "User deleted successfully" });
  } catch (error) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_e) {}
    }

    if (error?.code === "SQLITE_CONSTRAINT") {
      try {
        const diagUser = await database.execute({
          sql: "SELECT id, username FROM users WHERE username = ?",
          args: [username],
        });
        const diagUserRow = diagUser.rows?.[0];
        const diagUserId = diagUserRow?.id;

        const tables = await database.execute({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          args: [],
        });
        const pending = [];

        for (const r of tables.rows ?? []) {
          const t = r.name;
          if (!t || String(t).toLowerCase() === "users") continue;
          const qt = escapeSqliteIdentifier(t);

          let fkList;
          try {
            fkList = await database.execute({
              sql: `PRAGMA foreign_key_list(${qt})`,
              args: [],
            });
          } catch (_e) {
            continue;
          }

          for (const fk of fkList.rows ?? []) {
            if (String(fk.table ?? "").toLowerCase() !== "users") continue;
            const fromCol = fk.from;
            const toCol = fk.to;
            if (!fromCol || !toCol) continue;

            let countQuery;
            let countArgs;
            if (String(toCol).toLowerCase() === "username") {
              countQuery = `SELECT COUNT(1) as c FROM ${qt} WHERE ${escapeSqliteIdentifier(fromCol)} = ?`;
              countArgs = [username];
            } else if (
              String(toCol).toLowerCase() === "id" &&
              diagUserId !== undefined &&
              diagUserId !== null
            ) {
              countQuery = `SELECT COUNT(1) as c FROM ${qt} WHERE ${escapeSqliteIdentifier(fromCol)} = ?`;
              countArgs = [diagUserId];
            } else {
              continue;
            }

            try {
              const c = await database.execute({
                sql: countQuery,
                args: countArgs,
              });
              const n = Number(c.rows?.[0]?.c ?? 0);
              if (n > 0) {
                pending.push({
                  table: t,
                  column: fromCol,
                  parentColumn: toCol,
                  count: n,
                });
              }
            } catch (_e) {}
          }
        }

        if (pending.length > 0) {
          console.error("Delete user blocked by FK references:", pending);
        }
      } catch (_e) {}

      return res.status(409).send({
        status: "Error",
        message: "User deletion blocked by related records",
      });
    }
    console.error(error);
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to delete user" });
  }
}

async function getUserInfo(req, res) {
  const { username } = req.params;
  const { rows: userRows } = await database.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username],
  });
  const user = cryptoUtils.decryptFields(
    userRows[0],
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );
  if (!user) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }

  const opinionsQuery = await database.execute({
    sql: "SELECT * FROM comments WHERE username_trayect = ?",
    args: [username],
  });
  let ListOpinions = opinionsQuery.rows;
  const numOpinions = ListOpinions.length;
  let averageRating;
  if (numOpinions === 0) {
    averageRating = 0;
  } else {
    averageRating =
      ListOpinions.reduce((acc, opinion) => acc + opinion.rating, 0) /
      numOpinions;
  }

  let viajes = 0;
  try {
    viajes = await countUserViajes(username);
  } catch (_e) {
    viajes = 0;
  }

  const userInfo = {
    username: user.username,
    name: user.name,
    surname: user.surname,
    phone: user.phone,
    email: user.email,
    img_perfil: user.img_perfil,
    role: user.role,
    averageRating: averageRating,
    numOpinions: numOpinions,
    about_me: user.about_me,
    viajes: viajes,
  };

  return res.status(200).send({
    status: "Success",
    message: "User found successfully",
    data: userInfo,
  });
}
async function getMyUserInfo(req, res) {
  const findUser = req.user;
  const opinionsQuery = await database.execute({
    sql: "SELECT * FROM comments WHERE username_trayect = ?",
    args: [findUser.username],
  });
  let ListOpinions = opinionsQuery.rows;
  const numOpinions = ListOpinions.length;
  let averageRating;
  if (numOpinions === 0) {
    averageRating = 0;
  } else {
    averageRating =
      ListOpinions.reduce((acc, opinion) => acc + opinion.rating, 0) /
      numOpinions;
  }

  let viajes = 0;
  try {
    viajes = await countUserViajes(findUser.username);
  } catch (_e) {
    viajes = 0;
  }

  const userInfo = {
    username: findUser.username,
    name: findUser.name,
    surname: findUser.surname,
    phone: findUser.phone,
    email: findUser.email,
    img_perfil: findUser.img_perfil,
    role: findUser.role,
    averageRating: averageRating,
    numOpinions: numOpinions,
    about_me: findUser.about_me,
    viajes: viajes,
  };

  return res.status(200).send({
    status: "Success",
    message: "User found successfully",
    data: userInfo,
  });
}

export const methods = {
  updateUserPatch,
  removeUser,
  getUserInfo,
  updateMyUserPatch,
  getMyUserInfo,
};
