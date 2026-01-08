import dotenv from "dotenv";
import database from "../database.js";
import { EnterpriseSchemas } from "../schemas/enterprise.js";

dotenv.config();

async function getMe(req, res) {
    const enterprise = req.enterprise;
    return res.status(200).send({
        status: "Success",
        enterprise: {
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
            created_at: enterprise.created_at,
        },
    });
}

async function patchMe(req, res) {
    const enterprise = req.enterprise;

    const result = EnterpriseSchemas.validateEnterprisePartialWithoutSensitive(req.body);
    if (!result.success) {
        return res.status(400).send({ status: "Error", message: JSON.parse(result.error.message) });
    }

    const updates = { ...result.data };

    delete updates.id;
    delete updates.verified;
    delete updates.email;

    const keys = Object.keys(updates);
    if (keys.length === 0) {
        return res.status(400).send({ status: "Error", message: "No fields to update" });
    }

    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const args = [...keys.map((k) => updates[k]), enterprise.id];

    const updateRes = await database.execute({
        sql: `UPDATE enterprises SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args,
    });

    if (!updateRes || updateRes.rowsAffected === 0) {
        return res.status(500).send({ status: "Error", message: "Failed to update enterprise" });
    }

    const refreshed = await database.execute({
        sql: "SELECT id, name, email, phone, cif, website, address_line1, address_line2, city, province, postal_code, country, verified, created_at, updated_at FROM enterprises WHERE id = ?",
        args: [enterprise.id],
    });

    return res.status(200).send({ status: "Success", message: "Enterprise updated successfully", enterprise: refreshed.rows?.[0] });
}

export const methods = {
    getMe,
    patchMe,
};
