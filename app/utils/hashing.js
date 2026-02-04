import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
// Clave secreta guardada en el servidor (archivo .env)
const ENCRYPTION_KEY = process.env.MY_SECRET_KEY; // Debe tener 32 chars
const IV_LENGTH = 16; // Para AES
dotenv.config();
async function hashValue(numSalt, value) {
  const salt = await bcrypt.genSalt(numSalt);
  const hash = await bcrypt.hash(value, salt);
  return hash;
}
async function createCookie(username) {
  const token = jsonwebtoken.sign(
    { username: username },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.EXPIRATION_TIME },
  );

  const cookiesOptions = {
    expires: new Date(
      Date.now() +
        process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
    ), // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
  };
  return { token, cookiesOptions };
}

function encrypt(text) {
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  // Retornamos el IV y el dato cifrado
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}
export const methods = {
  hashValue,
  createCookie,
  encrypt,
};
