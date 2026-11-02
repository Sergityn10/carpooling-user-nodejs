import { z } from "zod";

const InviteMemberSchema = z.object({
  email: z
    .string({ required_error: "El correo electrónico del empleado es obligatorio" })
    .email("El formato del correo electrónico no es válido")
    .max(255)
    .toLowerCase(),
  role: z
    .enum(["ADMIN", "MANAGER", "EMPLOYEE"], {
      errorMap: () => ({ message: "El rol debe ser ADMIN, MANAGER o EMPLOYEE" }),
    })
    .default("EMPLOYEE"),
  department: z.string().max(100).optional().nullable(),
  employee_code: z.string().max(50).optional().nullable(),
});

const AcceptInvitationSchema = z.object({
  token: z
    .string({ required_error: "El token de invitación es obligatorio" })
    .min(32, "Token de invitación inválido")
    .max(100),
});

const ChangeRoleSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"], {
    errorMap: () => ({ message: "El rol debe ser ADMIN, MANAGER o EMPLOYEE" }),
  }),
});

const MemberQueryFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(["all", "ADMIN", "MANAGER", "EMPLOYEE"]).optional(),
  department: z.string().optional(),
  status: z.enum(["all", "ACTIVE", "INVITED", "SUSPENDED"]).optional(),
});

export const EnterpriseMemberSchemas = {
  validateInviteMember: (data) => InviteMemberSchema.safeParse(data),
  validateAcceptInvitation: (data) => AcceptInvitationSchema.safeParse(data),
  validateChangeRole: (data) => ChangeRoleSchema.safeParse(data),
  validateMemberQueryFilters: (data) => MemberQueryFilterSchema.safeParse(data),
};
