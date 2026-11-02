import crypto from "crypto";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { EnterpriseMemberSchemas } from "../schemas/enterprise_member.js";
import { EnterpriseMemberFactory } from "../domain/EnterpriseMemberFactory.js";
import { notificationsService } from "../services/notificationsService.js";
import { eventBus } from "../services/eventBus.js";

dotenv.config();

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.ORIGIN_URL ||
  "http://localhost:5173";

/**
 * Invita a un nuevo miembro a la organización enviándole un correo electrónico con un enlace seguro.
 * Solo accesible por administradores de la organización o Super Admins.
 * POST /api/enterprise/:enterpriseId/members/invite
 */
async function inviteMember(req, res) {
  try {
    const enterpriseId =
      req.params.enterpriseId ||
      req.enterprise?.id ||
      req.enterpriseMember?.enterprise_id;

    if (!enterpriseId) {
      return res.status(400).json({
        status: "Error",
        message: "Identificador de organización requerido.",
      });
    }

    const validation = EnterpriseMemberSchemas.validateInviteMember(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: "Error",
        message: validation.error.errors[0]?.message || "Datos de invitación inválidos",
        errors: validation.error.errors,
      });
    }

    const { email, role, department, employee_code } = validation.data;

    // Verificar existencia y disponibilidad de la empresa
    const enterprise = await prisma.enterprise.findUnique({
      where: { id: enterpriseId },
      select: {
        id: true,
        name: true,
        is_active: true,
        is_deleted: true,
      },
    });

    if (!enterprise || enterprise.is_deleted || !enterprise.is_active) {
      return res.status(404).json({
        status: "Error",
        message: "Organización no encontrada o inactiva.",
      });
    }

    // Comprobar si el usuario ya es miembro activo de esta empresa
    const existingUser = await prisma.user.findFirst({
      where: { email },
      include: {
        enterpriseMemberships: {
          where: {
            enterprise_id: enterpriseId,
            status: "ACTIVE",
          },
        },
      },
    });

    if (existingUser && existingUser.enterpriseMemberships.length > 0) {
      return res.status(400).json({
        status: "Error",
        message: "El usuario ya es miembro activo de esta organización.",
      });
    }

    // Generar token criptográfico único (64 caracteres hexadecimales)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días de validez

    // Comprobar si ya existe una invitación previa no aceptada para este email
    const existingInvitation = await prisma.enterpriseInvitation.findFirst({
      where: {
        enterprise_id: enterpriseId,
        email,
        accepted_at: null,
      },
    });

    let invitation;
    if (existingInvitation) {
      invitation = await prisma.enterpriseInvitation.update({
        where: { id: existingInvitation.id },
        data: {
          token,
          role,
          department: department ?? null,
          employee_code: employee_code ?? null,
          expires_at: expiresAt,
        },
      });
    } else {
      invitation = await prisma.enterpriseInvitation.create({
        data: {
          enterprise_id: enterpriseId,
          email,
          role,
          department: department ?? null,
          employee_code: employee_code ?? null,
          token,
          expires_at: expiresAt,
        },
      });
    }

    const invitationLink = `${FRONTEND_URL}/enterprise/invitation/accept?token=${token}`;
    const invitedBy = req.user?.id || req.enterprise?.id || "admin";

    // Publicar evento en el bus RabbitMQ para procesamiento asíncrono en carpooling-notiifications
    try {
      await eventBus.enterpriseMemberInvited({
        invitation_id: invitation.id,
        enterprise_id: enterprise.id,
        enterprise_name: enterprise.name,
        email,
        role,
        department: department ?? null,
        employee_code: employee_code ?? null,
        token,
        expires_at: expiresAt.toISOString(),
        invitation_link: invitationLink,
        invited_by: invitedBy,
      });
    } catch (busError) {
      console.warn(
        "[enterpriseMembers.inviteMember] Error publicando evento RabbitMQ:",
        busError?.message ?? busError,
      );
    }

    return res.status(201).json({
      status: "Success",
      message: `Invitación enviada con éxito a ${email}.`,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        department: invitation.department,
        employee_code: invitation.employee_code,
        expires_at: invitation.expires_at,
        invitation_link: invitationLink,
      },
    });
  } catch (error) {
    console.error("Error en inviteMember:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al enviar la invitación.",
    });
  }
}

/**
 * Valida un token de invitación y devuelve los datos públicos de la empresa y la invitación.
 * Endpoint público para ser consultado antes de aceptar.
 * GET /api/enterprise/invitations/validate?token=...
 */
async function validateInvitation(req, res) {
  try {
    const token = req.query.token;

    const validation = EnterpriseMemberSchemas.validateAcceptInvitation({ token });
    if (!validation.success) {
      return res.status(400).json({
        status: "Error",
        message: validation.error.errors[0]?.message || "Token de invitación inválido.",
      });
    }

    const invitation = await prisma.enterpriseInvitation.findUnique({
      where: { token },
      include: {
        enterprise: {
          select: {
            id: true,
            name: true,
            logo: true,
            sector: true,
            location: true,
            description: true,
            is_active: true,
            is_deleted: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        status: "Error",
        message: "Invitación no encontrada o token inválido.",
      });
    }

    if (!invitation.enterprise || invitation.enterprise.is_deleted || !invitation.enterprise.is_active) {
      return res.status(400).json({
        status: "Error",
        message: "La organización emisora de la invitación ya no está activa.",
      });
    }

    if (invitation.accepted_at) {
      return res.status(400).json({
        status: "Error",
        message: "Esta invitación ya ha sido aceptada previamente.",
      });
    }

    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(400).json({
        status: "Error",
        message: "Esta invitación ha caducado. Solicita una nueva invitación al administrador.",
      });
    }

    return res.status(200).json({
      status: "Success",
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        department: invitation.department,
        employee_code: invitation.employee_code,
        expires_at: invitation.expires_at,
        enterprise: invitation.enterprise,
      },
    });
  } catch (error) {
    console.error("Error en validateInvitation:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al validar la invitación.",
    });
  }
}

/**
 * Acepta una invitación pendiente asociando al usuario autenticado a la organización.
 * Requiere sesión de usuario física activa (req.user).
 * POST /api/enterprise/invitations/accept
 */
async function acceptInvitation(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        status: "Error",
        message: "Debes iniciar sesión para aceptar una invitación corporativa.",
      });
    }

    const validation = EnterpriseMemberSchemas.validateAcceptInvitation(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: "Error",
        message: validation.error.errors[0]?.message || "Token de invitación requerido.",
      });
    }

    const { token } = validation.data;

    const invitation = await prisma.enterpriseInvitation.findUnique({
      where: { token },
      include: {
        enterprise: true,
      },
    });

    if (!invitation) {
      return res.status(404).json({
        status: "Error",
        message: "Invitación no encontrada o token inválido.",
      });
    }

    if (!invitation.enterprise || invitation.enterprise.is_deleted || !invitation.enterprise.is_active) {
      return res.status(400).json({
        status: "Error",
        message: "La organización asociada a esta invitación no está activa.",
      });
    }

    if (invitation.accepted_at) {
      return res.status(400).json({
        status: "Error",
        message: "Esta invitación ya ha sido aceptada.",
      });
    }

    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(400).json({
        status: "Error",
        message: "La invitación ha caducado. Solicita un nuevo enlace al administrador.",
      });
    }

    // Verificar si ya existe una membresía activa de este usuario en esta empresa
    const existingMember = await prisma.enterpriseMember.findUnique({
      where: {
        enterprise_id_user_id: {
          enterprise_id: invitation.enterprise_id,
          user_id: user.id,
        },
      },
    });

    if (existingMember && existingMember.status === "ACTIVE") {
      return res.status(400).json({
        status: "Error",
        message: "Ya eres miembro activo de esta organización.",
      });
    }

    // Transacción: crear o reactivar la membresía del empleado y marcar la invitación como aceptada
    const [member] = await prisma.$transaction([
      prisma.enterpriseMember.upsert({
        where: {
          enterprise_id_user_id: {
            enterprise_id: invitation.enterprise_id,
            user_id: user.id,
          },
        },
        create: {
          enterprise_id: invitation.enterprise_id,
          user_id: user.id,
          role: invitation.role,
          department: invitation.department,
          employee_code: invitation.employee_code,
          status: "ACTIVE",
          joined_at: new Date(),
        },
        update: {
          role: invitation.role,
          department: invitation.department,
          employee_code: invitation.employee_code,
          status: "ACTIVE",
          joined_at: new Date(),
        },
      }),
      prisma.enterpriseInvitation.update({
        where: { id: invitation.id },
        data: {
          accepted_at: new Date(),
        },
      }),
    ]);

    // Instanciar objeto de dominio con factoría polimórfica
    const domainMember = EnterpriseMemberFactory.create(user, {
      ...member,
      enterprise: invitation.enterprise,
    });

    // Publicar evento en RabbitMQ
    try {
      await eventBus.enterpriseMemberJoined(
        invitation.enterprise_id,
        user.id,
        member.role,
      );
    } catch (busError) {
      console.warn("[enterpriseMembers.acceptInvitation] Error publicando evento:", busError?.message ?? busError);
    }

    return res.status(200).json({
      status: "Success",
      message: `¡Te has unido exitosamente a ${invitation.enterprise.name}!`,
      badge: domainMember.toCorporateBadge(),
      member,
    });
  } catch (error) {
    console.error("Error en acceptInvitation:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al aceptar la invitación.",
    });
  }
}

/**
 * Obtiene la lista de miembros de una organización con filtros y paginación.
 * Accesible por Gestores (MANAGER) o Administradores (ADMIN).
 * GET /api/enterprise/:enterpriseId/members
 */
async function getMembers(req, res) {
  try {
    const enterpriseId =
      req.params.enterpriseId ||
      req.enterprise?.id ||
      req.enterpriseMember?.enterprise_id;

    if (!enterpriseId) {
      return res.status(400).json({
        status: "Error",
        message: "Identificador de organización requerido.",
      });
    }

    const validation = EnterpriseMemberSchemas.validateMemberQueryFilters(req.query);
    if (!validation.success) {
      return res.status(400).json({
        status: "Error",
        message: validation.error.errors[0]?.message || "Parámetros de consulta inválidos.",
      });
    }

    const { page, limit, search, role, department, status } = validation.data;

    const where = {
      enterprise_id: enterpriseId,
    };

    if (role && role !== "all") {
      where.role = role;
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (department) {
      where.department = { contains: department };
    }

    if (search) {
      where.OR = [
        { department: { contains: search } },
        { employee_code: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { surname: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const [total, members] = await Promise.all([
      prisma.enterpriseMember.count({ where }),
      prisma.enterpriseMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              email: true,
              dni: true,
              phone: true,
              photo: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { joined_at: "desc" },
      }),
    ]);

    const formattedMembers = members.map((m) => {
      const domainInstance = EnterpriseMemberFactory.create(m.user, m);
      return {
        id: m.id,
        enterprise_id: m.enterprise_id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        department: m.department,
        employee_code: m.employee_code,
        joined_at: m.joined_at,
        user: m.user,
        permissions: {
          canInviteMembers: typeof domainInstance.canInviteMembers === "function" && domainInstance.canInviteMembers(),
          canRemoveMembers: typeof domainInstance.canRemoveMembers === "function" && domainInstance.canRemoveMembers(),
          canChangeMemberRole: typeof domainInstance.canChangeMemberRole === "function" && domainInstance.canChangeMemberRole(),
          canCreateCorporateEvents: typeof domainInstance.canCreateCorporateEvents === "function" && domainInstance.canCreateCorporateEvents(),
          canViewCAEMetrics: typeof domainInstance.canViewCAEMetrics === "function" && domainInstance.canViewCAEMetrics(),
        },
      };
    });

    return res.status(200).json({
      status: "Success",
      data: formattedMembers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("Error en getMembers:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al obtener los miembros de la organización.",
    });
  }
}

/**
 * Modifica el rol corporativo de un empleado dentro de la empresa.
 * Salvaguarda: No se permite degradar al último administrador activo.
 * PATCH /api/enterprise/:enterpriseId/members/:memberId/role
 */
async function changeMemberRole(req, res) {
  try {
    const enterpriseId =
      req.params.enterpriseId ||
      req.enterprise?.id ||
      req.enterpriseMember?.enterprise_id;

    const { memberId } = req.params;

    const validation = EnterpriseMemberSchemas.validateChangeRole(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: "Error",
        message: validation.error.errors[0]?.message || "Rol corporativo inválido.",
      });
    }

    const { role: newRole } = validation.data;

    const targetMember = await prisma.enterpriseMember.findFirst({
      where: {
        id: memberId,
        enterprise_id: enterpriseId,
      },
    });

    if (!targetMember) {
      return res.status(404).json({
        status: "Error",
        message: "Miembro no encontrado en esta organización.",
      });
    }

    // Salvaguarda anti-orfandad: Si el usuario actual es ADMIN y se desea cambiar a MANAGER o EMPLOYEE,
    // comprobar que exista al menos otro administrador activo en la organización.
    if (targetMember.role === "ADMIN" && newRole !== "ADMIN") {
      const activeAdminsCount = await prisma.enterpriseMember.count({
        where: {
          enterprise_id: enterpriseId,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });

      if (activeAdminsCount <= 1) {
        return res.status(400).json({
          status: "Error",
          message:
            "Operación rechazada. La organización debe tener al menos un administrador activo. Asigna otro administrador antes de modificar el rol de este usuario.",
        });
      }
    }

    const updatedMember = await prisma.enterpriseMember.update({
      where: { id: memberId },
      data: { role: newRole },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
          },
        },
      },
    });

    try {
      await eventBus.enterpriseMemberRoleChanged(enterpriseId, memberId, newRole);
    } catch (busError) {
      console.warn("[enterpriseMembers.changeMemberRole] Error publicando evento:", busError?.message ?? busError);
    }

    return res.status(200).json({
      status: "Success",
      message: `Rol actualizado con éxito a ${newRole}.`,
      member: updatedMember,
    });
  } catch (error) {
    console.error("Error en changeMemberRole:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al modificar el rol del miembro.",
    });
  }
}

/**
 * Desvincula a un miembro de la organización.
 * Preserva intacta la cuenta personal de YouConnext del usuario (DNI, coches, rutinas, valoraciones).
 * Salvaguarda: No se permite eliminar al último administrador activo.
 * DELETE /api/enterprise/:enterpriseId/members/:memberId
 */
async function removeMember(req, res) {
  try {
    const enterpriseId =
      req.params.enterpriseId ||
      req.enterprise?.id ||
      req.enterpriseMember?.enterprise_id;

    const { memberId } = req.params;

    const targetMember = await prisma.enterpriseMember.findFirst({
      where: {
        id: memberId,
        enterprise_id: enterpriseId,
      },
    });

    if (!targetMember) {
      return res.status(404).json({
        status: "Error",
        message: "Miembro no encontrado en esta organización.",
      });
    }

    // Salvaguarda anti-orfandad: Si el miembro a eliminar es ADMIN, verificar que quede al menos otro activo
    if (targetMember.role === "ADMIN") {
      const activeAdminsCount = await prisma.enterpriseMember.count({
        where: {
          enterprise_id: enterpriseId,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });

      if (activeAdminsCount <= 1) {
        return res.status(400).json({
          status: "Error",
          message:
            "Operación rechazada. No es posible desvincular al único administrador activo de la organización.",
        });
      }
    }

    // Se elimina el registro de relación EnterpriseMember únicamente
    await prisma.enterpriseMember.delete({
      where: { id: memberId },
    });

    try {
      await eventBus.enterpriseMemberRemoved(enterpriseId, targetMember.user_id, memberId);
    } catch (busError) {
      console.warn("[enterpriseMembers.removeMember] Error publicando evento:", busError?.message ?? busError);
    }

    return res.status(200).json({
      status: "Success",
      message:
        "Miembro desvinculado de la organización con éxito. La cuenta personal de YouConnext no ha sido afectada.",
    });
  } catch (error) {
    console.error("Error en removeMember:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al desvincular al miembro.",
    });
  }
}

/**
 * Obtiene la lista de invitaciones pendientes para una organización.
 * GET /api/enterprise/:enterpriseId/invitations
 */
async function getPendingInvitations(req, res) {
  try {
    const enterpriseId =
      req.params.enterpriseId ||
      req.enterprise?.id ||
      req.enterpriseMember?.enterprise_id;

    if (!enterpriseId) {
      return res.status(400).json({
        status: "Error",
        message: "Identificador de organización requerido.",
      });
    }

    const invitations = await prisma.enterpriseInvitation.findMany({
      where: {
        enterprise_id: enterpriseId,
        accepted_at: null,
      },
      orderBy: { created_at: "desc" },
    });

    const now = new Date();
    const formatted = invitations.map((inv) => ({
      ...inv,
      is_expired: now > new Date(inv.expires_at),
      invitation_link: `${FRONTEND_URL}/enterprise/invitation/accept?token=${inv.token}`,
    }));

    return res.status(200).json({
      status: "Success",
      invitations: formatted,
    });
  } catch (error) {
    console.error("Error en getPendingInvitations:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al consultar las invitaciones pendientes.",
    });
  }
}

/**
 * Revoca o cancela una invitación pendiente.
 * DELETE /api/enterprise/:enterpriseId/invitations/:invitationId
 */
async function revokeInvitation(req, res) {
  try {
    const enterpriseId =
      req.params.enterpriseId ||
      req.enterprise?.id ||
      req.enterpriseMember?.enterprise_id;

    const { invitationId } = req.params;

    const invitation = await prisma.enterpriseInvitation.findFirst({
      where: {
        id: invitationId,
        enterprise_id: enterpriseId,
      },
    });

    if (!invitation) {
      return res.status(404).json({
        status: "Error",
        message: "Invitación no encontrada.",
      });
    }

    await prisma.enterpriseInvitation.delete({
      where: { id: invitationId },
    });

    return res.status(200).json({
      status: "Success",
      message: "Invitación revocada con éxito.",
    });
  } catch (error) {
    console.error("Error en revokeInvitation:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al revocar la invitación.",
    });
  }
}

/**
 * Devuelve todas las organizaciones a las que pertenece el usuario autenticado.
 * GET /api/user/my-organizations
 */
async function getMyCorporateMemberships(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        status: "Error",
        message: "Usuario no autenticado.",
      });
    }

    const memberships = await prisma.enterpriseMember.findMany({
      where: {
        user_id: user.id,
        status: "ACTIVE",
        enterprise: {
          is_deleted: false,
          is_active: true,
        },
      },
      include: {
        enterprise: {
          select: {
            id: true,
            name: true,
            email: true,
            logo: true,
            sector: true,
            location: true,
            description: true,
          },
        },
      },
      orderBy: { joined_at: "desc" },
    });

    const results = memberships.map((m) => {
      const domainInstance = EnterpriseMemberFactory.create(user, m);
      return {
        membership_id: m.id,
        role: m.role,
        department: m.department,
        employee_code: m.employee_code,
        joined_at: m.joined_at,
        enterprise: m.enterprise,
        badge: domainInstance.toCorporateBadge(),
        permissions: {
          canInviteMembers: typeof domainInstance.canInviteMembers === "function" && domainInstance.canInviteMembers(),
          canRemoveMembers: typeof domainInstance.canRemoveMembers === "function" && domainInstance.canRemoveMembers(),
          canChangeMemberRole: typeof domainInstance.canChangeMemberRole === "function" && domainInstance.canChangeMemberRole(),
          canCreateCorporateEvents: typeof domainInstance.canCreateCorporateEvents === "function" && domainInstance.canCreateCorporateEvents(),
          canViewCAEMetrics: typeof domainInstance.canViewCAEMetrics === "function" && domainInstance.canViewCAEMetrics(),
        },
      };
    });

    return res.status(200).json({
      status: "Success",
      memberships: results,
    });
  } catch (error) {
    console.error("Error en getMyCorporateMemberships:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error interno al consultar las membresías corporativas.",
    });
  }
}

export const enterpriseMembers = {
  inviteMember,
  validateInvitation,
  acceptInvitation,
  getMembers,
  changeMemberRole,
  removeMember,
  getPendingInvitations,
  revokeInvitation,
  getMyCorporateMemberships,
};
