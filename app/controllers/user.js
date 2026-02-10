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

async function findForeignKeyFromColumn(tx, tableName, referencedTableLower) {
  let fkResult;
  try {
    fkResult = await tx.execute({
      sql: `PRAGMA foreign_key_list(${escapeSqliteIdentifier(tableName)})`,
      args: [],
    });
  } catch (error) {
    if (isNoSuchTableError(error, tableName)) return null;
    throw error;
  }

  const fkRows = fkResult.rows ?? [];
  const match = fkRows.find(
    (fk) => String(fk.table ?? "").toLowerCase() === referencedTableLower,
  );
  return match?.from ?? null;
}

async function countUserViajes(conductor) {
  if (!conductor) return 0;

  // const selectedL ower = preferred.find((p) => cols.some((c) => c.lower === p));
  // const selected = cols.find((c) => c.lower === selectedLower)?.name;
  // if (!selected) return 0;

  const { rows } = await database.execute({
    sql: `SELECT id FROM trayectos WHERE conductor = ?`,
    args: [conductor],
  });

  return rows.length;
}

async function deleteAllRowsReferencingUser(tx, userId) {
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

        if (String(toCol).toLowerCase() === "id") {
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

  const { id } = req.params;

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = req.user ?? (await authorization.reviseCookie(req));
  if (!findUser || String(findUser.id) !== String(id)) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }

  const { rows } = await database.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
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
      sql: "SELECT id, email, dni FROM users",
      args: [],
    });
    const collision = (allRows ?? []).find((r) => {
      if (!r?.dni) return false;
      const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
      return plain === dniCandidate && String(r.id) !== String(id);
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
  const args = [...keys.map((k) => result.data[k]), id];
  const updateUserQuery = await database.execute({
    sql: `UPDATE users SET ${setClause} WHERE id = ?`,
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

  if (result.data.password) {
    result.data.password = await utils.hashValue(10, result.data.password);
  }

  if (result.data.dni) {
    const dniCandidate = String(result.data.dni);
    const { rows: allRows } = await database.execute({
      sql: "SELECT email, dni FROM users",
      args: [],
    });
    const collision = (allRows ?? []).find((r) => {
      if (!r?.dni) return false;
      const plain = cryptoUtils.decryptFields(r, ["dni"]).dni;
      return (
        plain === dniCandidate && String(r.email) !== String(findUser.email)
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
  const args = [...keys.map((k) => result.data[k]), findUser.email];
  const updateUserQuery = await database.execute({
    sql: `UPDATE users SET ${setClause} WHERE email = ?`,
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
  const { id } = req.params;

  //Comprobar si el usuario existe y es el mismo que está logueado
  const findUser = req.user ?? (await authorization.reviseCookie(req));
  if (!findUser || String(findUser.id) !== String(id)) {
    return res.status(401).send({ status: "Error", message: "Unauthorized" });
  }

  let userId = null;

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
      sql: "SELECT * FROM users WHERE id = ?",
      args: [id],
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

    userId = user.id;

    // username no longer exists; keep a null placeholder for best-effort cleanup

    try {
      await tx.execute({
        sql: "PRAGMA foreign_keys = OFF",
        args: [],
      });
    } catch (_e) {}

    // Best-effort automatic cascade delete for any table that has FK -> users.
    // This prevents missing a table (and hitting SQLITE_CONSTRAINT) when deleting the user.
    await deleteAllRowsReferencingUser(tx, userId);

    try {
      await tx.execute({
        sql: `DELETE FROM payment_intents
                      WHERE sender_account IN (SELECT stripe_account_id FROM accounts WHERE user_id = ?)`,
        args: [userId],
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
                      WHERE id_reserva IN (SELECT id_reserva FROM reservas WHERE user_id = ?)`,
        args: [userId],
      });
    } catch (error) {
      if (
        !isNoSuchTableError(error, "payment_intents") &&
        !isNoSuchTableError(error, "reservas") &&
        !isNoSuchColumnError(error, "user_id")
      ) {
        throw error;
      }
    }

    try {
      const trayectosCol = await findFirstExistingColumn(tx, "trayectos", [
        "conductor",
        "driver",
        "user",
        "usuario",
        "owner",
        "creator",
        "created_by",
        "userId_user",
        "userId_driver",
      ]);

      const trayectosIdCol = await findFirstExistingColumn(tx, "trayectos", [
        "id",
        "id_trayecto",
        "id_viaje",
      ]);

      let trayectoIds = [];
      if (trayectosCol && trayectosIdCol) {
        const idsRes = await tx.execute({
          sql: `SELECT ${escapeSqliteIdentifier(trayectosIdCol)} AS id FROM trayectos WHERE ${escapeSqliteIdentifier(trayectosCol)} = ?`,
          args: [userId],
        });
        trayectoIds = (idsRes.rows ?? [])
          .map((r) => r?.id)
          .filter((v) => v !== undefined && v !== null);
      }

      let reservaIds = [];
      try {
        const reservasUserCol = await findFirstExistingColumn(tx, "reservas", [
          "user_id",
          "user",
          "usuario",
        ]);
        const reservasTrayectoFkCol = await findForeignKeyFromColumn(
          tx,
          "reservas",
          "trayectos",
        );

        if (reservasUserCol) {
          await tx.execute({
            sql: `DELETE FROM reservas WHERE ${escapeSqliteIdentifier(reservasUserCol)} = ?`,
            args: [userId],
          });
        }

        if (reservasTrayectoFkCol && trayectoIds.length > 0) {
          const placeholders = trayectoIds.map(() => "?").join(", ");

          const reservaIdCol = await findFirstExistingColumn(tx, "reservas", [
            "id_reserva",
            "id",
          ]);

          if (reservaIdCol) {
            const rids = await tx.execute({
              sql: `SELECT ${escapeSqliteIdentifier(reservaIdCol)} AS id FROM reservas WHERE ${escapeSqliteIdentifier(reservasTrayectoFkCol)} IN (${placeholders})`,
              args: trayectoIds,
            });
            reservaIds = (rids.rows ?? [])
              .map((r) => r?.id)
              .filter((v) => v !== undefined && v !== null);
          }

          await tx.execute({
            sql: `DELETE FROM reservas WHERE ${escapeSqliteIdentifier(reservasTrayectoFkCol)} IN (${placeholders})`,
            args: trayectoIds,
          });
        }
      } catch (error) {
        if (!isNoSuchTableError(error, "reservas")) {
          throw error;
        }
      }

      if (reservaIds.length > 0) {
        const placeholders = reservaIds.map(() => "?").join(", ");

        try {
          await tx.execute({
            sql: `DELETE FROM payment_intents WHERE id_reserva IN (${placeholders})`,
            args: reservaIds,
          });
        } catch (error) {
          if (!isNoSuchTableError(error, "payment_intents")) {
            throw error;
          }
        }

        try {
          await tx.execute({
            sql: `DELETE FROM wallet_transactions WHERE id_reserva IN (${placeholders})`,
            args: reservaIds,
          });
        } catch (error) {
          if (!isNoSuchTableError(error, "wallet_transactions")) {
            throw error;
          }
        }
      }

      try {
        await tx.execute({
          sql: "DELETE FROM comments WHERE user_id_commentator = ? OR user_id_trayect = ?",
          args: [userId, userId],
        });
      } catch (error) {
        if (!isNoSuchTableError(error, "comments")) {
          if (!isNoSuchColumnError(error, "user_id_commentator")) {
            throw error;
          }
        }
      }

      if (trayectoIds.length > 0) {
        const placeholders = trayectoIds.map(() => "?").join(", ");
        try {
          await tx.execute({
            sql: `DELETE FROM comments WHERE id_trayecto IN (${placeholders})`,
            args: trayectoIds,
          });
        } catch (error) {
          if (
            !isNoSuchTableError(error, "comments") &&
            !isNoSuchColumnError(error, "id_trayecto")
          ) {
            throw error;
          }
        }
      }

      if (trayectosCol) {
        await tx.execute({
          sql: `DELETE FROM trayectos WHERE ${escapeSqliteIdentifier(trayectosCol)} = ?`,
          args: [userId],
        });
      }
    } catch (error) {
      if (!isNoSuchTableError(error, "trayectos")) {
        throw error;
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM telegram_info WHERE user_id = ?",
        args: [userId],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "telegram_info")) {
        if (!isNoSuchColumnError(error, "user_id")) {
          throw error;
        }
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM cars WHERE user_id = ?",
        args: [userId],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "cars")) {
        if (!isNoSuchColumnError(error, "user_id")) {
          throw error;
        }
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM accounts WHERE user_id = ?",
        args: [userId],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "accounts")) {
        if (!isNoSuchColumnError(error, "user_id")) {
          throw error;
        }
      }
    }

    try {
      await tx.execute({
        sql: "DELETE FROM disponibilidad_semanal WHERE user_id = ?",
        args: [userId],
      });
    } catch (error) {
      if (isNoSuchTableError(error, "disponibilidad_semanal")) {
        // ignore
      } else if (isNoSuchColumnError(error, "user_id")) {
        // ignore (legacy schema)
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

    try {
      await tx.execute({
        sql: "DELETE FROM accounts WHERE user_id = ?",
        args: [userId],
      });
    } catch (error) {
      if (!isNoSuchTableError(error, "accounts")) {
        throw error;
      }
    }

    await deleteAllRowsReferencingUser(tx, userId);

    const deleteUserQuery = await tx.execute({
      sql: "DELETE FROM users WHERE id = ?",
      args: [userId],
    });
    if (deleteUserQuery.rowsAffected === 0) {
      try {
        await tx.rollback();
      } catch (_e) {}
      return res
        .status(500)
        .send({ status: "Error", message: "Failed to delete user" });
    }

    await deleteAllRowsReferencingUser(tx, userId);

    try {
      await tx.execute({
        sql: "PRAGMA foreign_keys = ON",
        args: [],
      });
    } catch (_e) {}

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
        const diagUserId = userId;

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
            if (
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
  const { id } = req.params;
  const { rows: userRows } = await database.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  const user = cryptoUtils.decryptFields(
    userRows[0],
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );
  if (!user) {
    return res.status(404).send({ status: "Error", message: "User not found" });
  }

  const opinionsQuery = await database.execute({
    sql: "SELECT * FROM comments WHERE user_id_trayect = ?",
    args: [id],
  });
  const myOpinionsQuery = await database.execute({
    sql: "SELECT * FROM comments WHERE user_id_commentator = ?",
    args: [id],
  });
  let ListOpinions = opinionsQuery.rows;
  const numOpinions = ListOpinions.length;
  let myListOpinions = myOpinionsQuery.rows;
  const myNumOpinions = myListOpinions.length;
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
    viajes = await countUserViajes(user.id);
  } catch (_e) {
    viajes = 0;
  }

  // Fetch user preferences
  const preferencesRows = await database.execute({
    sql: "SELECT pref_key, value FROM user_preferences WHERE user_id = ?",
    args: [id],
  });
  const preferences = {};
  (preferencesRows.rows || []).forEach((row) => {
    preferences[row.pref_key] = row.value;
  });

  const userInfo = {
    userId: user.id,
    name: user.name,
    surname: user.surname,
    phone: user.phone,
    email: user.email,
    img_perfil: user.img_perfil,
    role: user.role,
    averageRating: averageRating,
    numOpinions: numOpinions,
    myNumOpinions: myNumOpinions,
    about_me: user.about_me,
    viajes: viajes,
    preferences: preferences,
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
    sql: "SELECT * FROM comments WHERE user_id_trayect = ?",
    args: [findUser.id],
  });
  const myOpinionsQuery = await database.execute({
    sql: "SELECT * FROM comments WHERE user_id_commentator = ?",
    args: [findUser.id],
  });
  let ListOpinions = opinionsQuery.rows;
  const numOpinions = ListOpinions.length;
  let myListOpinions = myOpinionsQuery.rows;
  const myNumOpinions = myListOpinions.length;
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
    viajes = await countUserViajes(findUser.id);
  } catch (_e) {
    viajes = 0;
  }

  // Fetch user preferences
  const preferencesRows = await database.execute({
    sql: "SELECT pref_key, value FROM user_preferences WHERE user_id = ?",
    args: [findUser.id],
  });
  const preferences = {};
  (preferencesRows.rows || []).forEach((row) => {
    preferences[row.pref_key] = row.value;
  });

  const userInfo = {
    name: findUser.name,
    surname: findUser.surname,
    phone: findUser.phone,
    email: findUser.email,
    img_perfil: findUser.img_perfil,
    role: findUser.role,
    averageRating: averageRating,
    numOpinions: numOpinions,
    myNumOpinions: myNumOpinions,
    about_me: findUser.about_me,
    viajes: viajes,
    preferences: preferences,
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
