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
  { username, email, password, name },
  auth_method = "password",
  google_id = "",
) {
  const { rows: userRow } = await database.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username],
  });
  console.log(userRow);
  if (userRow.length > 0) {
    return { status: "Error", message: "Username already exists" };
  }

  const comprobarUser = await existUser(email);
  console.log(comprobarUser);
  if (comprobarUser) {
    return { status: "Error", message: "Email already created" };
  }
  const customer_account = await stripe.customers.create({
    name: name,
    individual_name: name,
    email: email,
    metadata: {
      username: username,
    },
  });
  const hash = await utils.hashValue(10, password);

  const encryptedUserFields = cryptoUtils.encryptFields(
    { name },
    cryptoUtils.USER_SENSITIVE_FIELDS,
  );

  switch (auth_method) {
    case "password":
      const insertResult = await database.execute({
        sql: "INSERT INTO users (username, email, password, name, stripe_customer_account,auth_method) VALUES (?, ?, ?, ?, ?, ?)",
        args: [
          username,
          email,
          hash,
          encryptedUserFields.name,
          customer_account.id,
          auth_method,
        ],
      });

      if (insertResult.rowsAffected === 0) {
        return res
          .status(500)
          .send({ status: "Error", message: "Failed to register user" });
      }
      break;
    case "google":
      const googleResult = await database.execute({
        sql: "INSERT INTO users (username, email, password, name, stripe_customer_account,auth_method,google_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          username,
          email,
          hash,
          encryptedUserFields.name,
          customer_account.id,
          auth_method,
          google_id,
        ],
      });

      if (googleResult.rowsAffected === 0) {
        return res
          .status(500)
          .send({ status: "Error", message: "Failed to register user" });
      }
      break;
    default:
      break;
  }
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
