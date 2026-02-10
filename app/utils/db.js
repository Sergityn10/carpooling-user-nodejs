import database from "../database.js";
import { methods as utils } from "../utils/hashing.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function existUser(data) {
  const { rows: emailRow } = await database.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [data],
  });
  if (emailRow.length > 0) return true;

  const { rows: googleRow } = await database.execute({
    sql: "SELECT * FROM users WHERE google_id = ?",
    args: [data],
  });
  if (googleRow.length > 0) return true;
  return null;
}

async function getUser(data) {
  const { rows: emailRow } = await database.execute({
    sql: "SELECT * FROM users WHERE email = ? ",
    args: [data],
  });
  if (emailRow.length > 0) return emailRow[0];

  const { rows: googleRow } = await database.execute({
    sql: "SELECT * FROM users WHERE google_id = ?",
    args: [data],
  });
  if (googleRow.length > 0) return googleRow[0];
  return null;
}

async function createUser(
  { email, password, name },
  auth_method = "password",
  google_id = "",
) {
  const comprobarUser = await existUser(email);
  if (comprobarUser) {
    return { status: "Error", message: "Email already created" };
  }
  const customer_account = await stripe.customers.create({
    name: name,
    individual_name: name,
    email: email,
  });
  const hash = await utils.hashValue(10, password);

  const encryptedUserFields = cryptoUtils.encryptFields(
    { name },
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  switch (auth_method) {
    case "password":
      const insertResult = await database.execute({
        sql: "INSERT INTO users (email, password, name, stripe_customer_account,auth_method) VALUES (?, ?, ?, ?, ?)",
        args: [
          email,
          hash,
          encryptedUserFields.name,
          customer_account.id,
          auth_method,
        ],
      });

      if (insertResult.rowsAffected === 0) {
        return { status: "Error", message: "Failed to register user" };
      }
      break;
    case "google":
      const googleResult = await database.execute({
        sql: "INSERT INTO users (email, password, name, stripe_customer_account,auth_method,google_id) VALUES (?, ?, ?, ?, ?, ?)",
        args: [
          email,
          hash,
          encryptedUserFields.name,
          customer_account.id,
          auth_method,
          google_id,
        ],
      });

      if (googleResult.rowsAffected === 0) {
        return { status: "Error", message: "Failed to register user" };
      }
      break;
    default:
      break;
  }

  const created = await getUser(email);
  return { status: "Success", user: created };
}

function createUsername(name) {
  return name.toLowerCase().replace(/\s/g, "");
}

export const methods = {
  getUser,
  existUser,
  createUser,
  createUsername,
};
