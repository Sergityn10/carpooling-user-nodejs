import { z } from "zod";

const EnterpriseSchema = z.object({
    id: z.number().int().positive().optional(),
    name: z.string().min(2).max(255),
    email: z.string().email(),
    password: z.string().min(6).max(255),
    phone: z.string().max(30).optional(),
    cif: z.string().max(50).optional(),
    website: z.string().max(255).optional(),
    address_line1: z.string().max(255).optional(),
    address_line2: z.string().max(255).optional(),
    city: z.string().max(120).optional(),
    province: z.string().max(120).optional(),
    postal_code: z.string().max(20).optional(),
    country: z.string().min(2).max(2).default("ES"),
    verified: z.boolean().optional(),
});

const EnterpriseRegisterSchema = EnterpriseSchema.pick({
    name: true,
    email: true,
    password: true,
    phone: true,
    cif: true,
    website: true,
    address_line1: true,
    address_line2: true,
    city: true,
    province: true,
    postal_code: true,
    country: true,
});

const EnterpriseLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

const EnterpriseSchemaPartial = EnterpriseSchema.partial();
const EnterpriseSchemaPartialWithoutSensitive = EnterpriseSchema.omit({ password: true }).partial();

function validateEnterprise(data) {
    return EnterpriseSchema.safeParse(data);
}

function validateEnterpriseRegister(data) {
    return EnterpriseRegisterSchema.safeParse(data);
}

function validateEnterpriseLogin(data) {
    return EnterpriseLoginSchema.safeParse(data);
}

function validateEnterprisePartial(data) {
    return EnterpriseSchemaPartial.safeParse(data);
}

function validateEnterprisePartialWithoutSensitive(data) {
    return EnterpriseSchemaPartialWithoutSensitive.safeParse(data);
}

export const EnterpriseSchemas = {
    validateEnterprise,
    validateEnterpriseRegister,
    validateEnterpriseLogin,
    validateEnterprisePartial,
    validateEnterprisePartialWithoutSensitive,
};
