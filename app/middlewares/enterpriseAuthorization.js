import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { PUBLIC_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

dotenv.config();

async function reviseEnterpriseCookie(req) {
  try {
    const cookieJWT = req.cookies.enterprise_access_token;
    if (!cookieJWT) {
      return false;
    }

    const decoded = jsonwebtoken.verify(cookieJWT, PUBLIC_KEY, {
      algorithms: [JWT_ALGORITHM],
    });
    const email = decoded?.email;
    if (!email) {
      return false;
    }

    const enterprise = await prisma.enterprise.findUnique({
      where: { email },
    });

    if (!enterprise) {
      return false;
    }

    return enterprise;
  } catch (error) {
    console.error("Error al verificar la cookie de empresa:", error);
    return false;
  }
}

async function isEnterpriseLoged(req, res, next) {
  const enterprise = await reviseEnterpriseCookie(req);
  if (!enterprise) {
    return res
      .status(403)
      .send({ status: "Error", message: "Access denied. Enterprises only." });
  }

  req.enterprise = enterprise;
  next();
}

export const enterpriseAuthorization = {
  reviseEnterpriseCookie,
  isEnterpriseLoged,
};
