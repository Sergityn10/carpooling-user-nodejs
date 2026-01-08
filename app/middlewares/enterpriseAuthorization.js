import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import database from "../database.js";

dotenv.config();

async function reviseEnterpriseCookie(req) {
    try {
        const cookieJWT = req.cookies.enterprise_access_token;
        if (!cookieJWT) {
            return false;
        }

        const decoded = jsonwebtoken.verify(cookieJWT, process.env.JWT_SECRET_KEY);
        const email = decoded?.email;
        if (!email) {
            return false;
        }

        const result = await database.execute({
            sql: "SELECT * FROM enterprises WHERE email = ?",
            args: [email],
        });

        const enterprise = result.rows?.[0];
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
        return res.status(403).send({ status: "Error", message: "Access denied. Enterprises only." });
    }

    req.enterprise = enterprise;
    next();
}

export const enterpriseAuthorization = {
    reviseEnterpriseCookie,
    isEnterpriseLoged,
};
