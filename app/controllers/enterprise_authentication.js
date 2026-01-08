import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import database from "../database.js";
import { methods as utils } from "../utils/hashing.js";
import { EnterpriseSchemas } from "../schemas/enterprise.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";

dotenv.config();

function getEnterpriseCookieOptions() {
    return {
        expires: new Date(Date.now() + process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000),
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
        return res.status(400).send({ status: "Error", message: JSON.parse(result.error.message) });
    }

    const { name, email, password, phone, cif, website, address_line1, address_line2, city, province, postal_code, country } = result.data;

    const exists = await database.execute({
        sql: "SELECT id FROM enterprises WHERE email = ?",
        args: [email],
    });

    if (exists.rows.length > 0) {
        return res.status(400).send({ status: "Error", message: "Enterprise already exists" });
    }

    const hash = await utils.hashValue(10, password);

    const insertResult = await database.execute({
        sql: `INSERT INTO enterprises (
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
                verified
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        args: [
            name,
            email,
            hash,
            phone ?? null,
            cif ?? null,
            website ?? null,
            address_line1 ?? null,
            address_line2 ?? null,
            city ?? null,
            province ?? null,
            postal_code ?? null,
            country ?? "ES",
            0,
        ],
    });

    if (!insertResult || insertResult.rowsAffected === 0) {
        return res.status(500).send({ status: "Error", message: "Failed to register enterprise" });
    }

    const enterpriseRow = await database.execute({
        sql: "SELECT id, name, email, phone, cif, website, address_line1, address_line2, city, province, postal_code, country, verified, created_at FROM enterprises WHERE email = ?",
        args: [email],
    });

    const enterprise = enterpriseRow.rows?.[0];

    const token = jsonwebtoken.sign(
        { email, type: "enterprise", enterprise_id: enterprise?.id ?? null },
        process.env.JWT_SECRET_KEY,
        { expiresIn: process.env.EXPIRATION_TIME }
    );

    res.cookie("enterprise_access_token", token, getEnterpriseCookieOptions());

    return res.status(201).send({ status: "Success", message: "Enterprise registered successfully", token, enterprise });
}

async function login(req, res) {
    const result = EnterpriseSchemas.validateEnterpriseLogin(req.body);
    if (!result.success) {
        return res.status(400).send({ status: "Error", message: JSON.parse(result.error.message) });
    }

    const { email, password } = result.data;

    const { rows } = await database.execute({
        sql: "SELECT * FROM enterprises WHERE email = ?",
        args: [email],
    });

    const enterprise = rows?.[0];
    if (!enterprise) {
        return res.status(404).send({ status: "Error", message: "Login failed" });
    }

    const ok = await bcrypt.compare(password, enterprise.password);
    if (!ok) {
        return res.status(404).send({ status: "Error", message: "Login failed" });
    }

    const token = jsonwebtoken.sign(
        { email, type: "enterprise", enterprise_id: enterprise.id },
        process.env.JWT_SECRET_KEY,
        { expiresIn: process.env.EXPIRATION_TIME }
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
    return res.status(200).send({ status: "Success", message: "Logout successful" });
}

async function validate(req, res) {
    try {
        const token = req.cookies.enterprise_access_token;
        if (!token) {
            return res.status(401).send({ status: "Error", message: "No token provided" });
        }

        const enterprise = await enterpriseAuthorization.reviseEnterpriseCookie(req);
        if (!enterprise) {
            return res.status(401).send({ status: "Error", message: "Invalid token" });
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

        return res.status(200).send({ status: "Success", message: "Token is valid", token, data });
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
