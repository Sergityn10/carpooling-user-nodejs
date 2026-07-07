import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
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

  const result = EnterpriseSchemas.validateEnterprisePartialWithoutSensitive(
    req.body,
  );
  if (!result.success) {
    return res
      .status(400)
      .send({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const updates = { ...result.data };

  delete updates.id;
  delete updates.verified;
  delete updates.email;

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return res
      .status(400)
      .send({ status: "Error", message: "No fields to update" });
  }

  try {
    const updated = await prisma.enterprise.update({
      where: { id: enterprise.id },
      data: updates,
    });

    return res
      .status(200)
      .send({
        status: "Success",
        message: "Enterprise updated successfully",
        enterprise: updated,
      });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: "Failed to update enterprise" });
  }
}

export const methods = {
  getMe,
  patchMe,
};
