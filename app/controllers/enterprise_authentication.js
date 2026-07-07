import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { methods as utils } from "../utils/hashing.js";
import { EnterpriseSchemas } from "../schemas/enterprise.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

dotenv.config();

function getEnterpriseCookieOptions() {
  return {
    expires: new Date(
      Date.now() +
        process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000,
  };
}

async function register(req, res) {
  const result = EnterpriseSchemas.validateEnterpriseRegister(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const {
    name,
    email,
    password,
    phone,
    cif,
    website,
    address_line1,
    address_line2,
    city,
    province,
    postal_code,
    country,
  } = result.data;

  const exists = await prisma.enterprise.findUnique({
    where: { email },
    select: { id: true },
  });

  if (exists) {
    return res
      .status(400)
      .send({ status: "Error", message: "Enterprise already exists" });
  }

  const hash = await utils.hashValue(10, password);

  try {
    const enterprise = await prisma.enterprise.create({
      data: {
        name,
        email,
        password: hash,
        phone: phone ?? null,
        cif: cif ?? null,
        website: website ?? null,
        address_line1: address_line1 ?? null,
        address_line2: address_line2 ?? null,
        city: city ?? null,
        province: province ?? null,
        postal_code: postal_code ?? null,
        country: country ?? "ES",
        verified: 0,
      },
    });

    const token = jsonwebtoken.sign(
      { email, type: "enterprise", enterprise_id: enterprise.id },
      PRIVATE_KEY,
      { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
    );

    res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

    return res.status(201).send({
      status: "Success",
      message: "Enterprise registered successfully",
      token,
      enterprise,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to register enterprise" });
  }
}

async function login(req, res) {
  const result = EnterpriseSchemas.validateEnterpriseLogin(req.body);
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const { email, password } = result.data;

  const enterprise = await prisma.enterprise.findUnique({
    where: { email },
  });

  if (!enterprise) {
    return res.status(404).send({ status: "Error", message: "Login failed" });
  }

  const ok = await bcrypt.compare(password, enterprise.password);
  if (!ok) {
    return res.status(404).send({ status: "Error", message: "Login failed" });
  }

  const token = jsonwebtoken.sign(
    { email, type: "enterprise", enterprise_id: enterprise.id },
    PRIVATE_KEY,
    { expiresIn: process.env.EXPIRATION_TIME, algorithm: JWT_ALGORITHM },
  );

  res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

  return res.status(200).send({
    status: "Success",
    message: "Login successful",
    token,
    enterprise: {
      id: enterprise.id,
      name: enterprise.name,
      email: enterprise.email,
      verified: enterprise.verified,
    },
  });
}

async function logout(req, res) {
  res.clearCookie("enterprise_access_token");
  return res
    .status(200)
    .send({ status: "Success", message: "Logout successful" });
}

async function validate(req, res) {
  try {
    const token = req.cookies.enterprise_access_token;
    if (!token) {
      return res
        .status(401)
        .send({ status: "Error", message: "No token provided" });
    }

    const enterprise =
      await enterpriseAuthorization.reviseEnterpriseCookie(req);
    if (!enterprise) {
      return res
        .status(401)
        .send({ status: "Error", message: "Invalid token" });
    }

    const data = {
      id: enterprise.id,
      name: enterprise.name,
      email: enterprise.email,
      phone: enterprise.phone,
      cif: enterprise.cif,
      website: enterprise.website,
      address_line1: enterprise.address_line1,
      address_line2: enterprise.address_line2,
      city: enterprise.city,
      province: enterprise.province,
      postal_code: enterprise.postal_code,
      country: enterprise.country,
      verified: enterprise.verified,
      type: "enterprise",
    };

    return res
      .status(200)
      .send({ status: "Success", message: "Token is valid", token, data });
  } catch (error) {
    res.clearCookie("enterprise_access_token");
    return res.status(401).send({ status: "Error", message: "Invalid token" });
  }
}

export const methods = {
  register,
  login,
  logout,
  validate,
};
