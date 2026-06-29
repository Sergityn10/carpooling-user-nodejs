import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIVATE_KEY_PATH = path.resolve(__dirname, "../../private/clave_privada.pem");
const PUBLIC_KEY_PATH = path.resolve(__dirname, "../../private/clave_publica.pem");

export const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");
export const PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, "utf8");

export const JWT_ALGORITHM = "RS256";
