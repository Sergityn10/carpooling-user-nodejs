import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { EnterpriseSchemas } from "../schemas/enterprise.js";
import { methods as utils } from "../utils/hashing.js";
import { EnterpriseUser } from "../domain/EnterpriseUser.js";

dotenv.config();

/**
 * Consulta de perfil para la organización en sesión.
 */
async function getMe(req, res) {
  const enterprise = req.enterprise;
  if (!enterprise) {
    return res.status(401).json({ status: "Error", message: "No autenticado" });
  }

  const domainEntity = new EnterpriseUser(enterprise);
  return res.status(200).json({
    status: "Success",
    enterprise: domainEntity.toSafeJSON(),
  });
}

/**
 * Actualización del perfil propio por la organización.
 */
async function patchMe(req, res) {
  const enterprise = req.enterprise;
  if (!enterprise) {
    return res.status(401).json({ status: "Error", message: "No autenticado" });
  }

  const result = EnterpriseSchemas.validateEnterpriseUpdate(req.body);
  if (!result.success) {
    return res
      .status(400)
      .json({ status: "Error", message: JSON.parse(result.error.message) });
  }

  const updates = { ...result.data };
  delete updates.id;
  delete updates.verified;
  delete updates.is_active;
  delete updates.is_deleted;
  delete updates.deleted_at;
  delete updates.role_id;
  delete updates.password;

  const nullableFields = [
    "cif",
    "website",
    "phone",
    "logo",
    "location",
    "description",
    "contact_person",
    "sector",
    "address_line1",
    "address_line2",
    "city",
    "province",
    "postal_code",
  ];
  for (const field of nullableFields) {
    if (updates[field] !== undefined) {
      if (typeof updates[field] === "string" && updates[field].trim() === "") {
        updates[field] = null;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json({ status: "Error", message: "No hay campos válidos para actualizar" });
  }

  try {
    const updated = await prisma.enterprise.update({
      where: { id: enterprise.id },
      data: updates,
    });

    const domainEntity = new EnterpriseUser(updated);

    return res.status(200).json({
      status: "Success",
      message: "Perfil de la empresa actualizado correctamente",
      enterprise: domainEntity.toSafeJSON(),
    });
  } catch (error) {
    console.error("Error en patchMe:", error);
    return res
      .status(500)
      .json({ status: "Error", message: "Error al actualizar la empresa" });
  }
}

/**
 * Alta administrativa de una Organización (Solo Admin).
 */
async function createEnterpriseByAdmin(req, res) {
  const result = EnterpriseSchemas.validateEnterpriseCreate(req.body);
  if (!result.success) {
    return res.status(400).json({
      status: "Error",
      message: JSON.parse(result.error.message),
    });
  }

  const {
    name,
    email,
    password,
    description,
    location,
    phone,
    cif,
    website,
    logo,
    contact_person,
    sector,
    employee_count,
    address_line1,
    address_line2,
    city,
    province,
    postal_code,
    country,
    verified,
    is_active,
    onboarding_ended,
  } = result.data;

  const sanitizeNull = (val) =>
    typeof val === "string" && val.trim() === "" ? null : (val ?? null);

  const cleanCif = sanitizeNull(cif);

  const exists = await prisma.enterprise.findUnique({
    where: { email },
    select: { id: true },
  });

  if (exists) {
    return res.status(409).json({
      status: "Error",
      message: "Ya existe una empresa registrada con este correo electrónico.",
    });
  }

  if (cleanCif) {
    const existingCif = await prisma.enterprise.findUnique({
      where: { cif: cleanCif },
      select: { id: true },
    });
    if (existingCif) {
      return res.status(409).json({
        status: "Error",
        message: "Ya existe una empresa registrada con este CIF/NIF.",
      });
    }
  }

  const hash = await utils.hashValue(10, password);

  try {
    const enterprise = await prisma.enterprise.create({
      data: {
        name,
        email,
        password: hash,
        description,
        location,
        phone: sanitizeNull(phone),
        cif: cleanCif,
        website: sanitizeNull(website),
        logo: sanitizeNull(logo),
        contact_person: sanitizeNull(contact_person),
        sector: sanitizeNull(sector),
        employee_count: employee_count ?? null,
        address_line1: sanitizeNull(address_line1),
        address_line2: sanitizeNull(address_line2),
        city: sanitizeNull(city),
        province: sanitizeNull(province),
        postal_code: sanitizeNull(postal_code),
        country: country ?? "ES",
        verified: verified ?? true,
        is_active: is_active ?? true,
        onboarding_ended: onboarding_ended ?? true,
        is_deleted: false,
        role_id: 3,
      },
    });

    const domainEntity = new EnterpriseUser(enterprise);

    return res.status(201).json({
      status: "Success",
      message: "Organización dada de alta con éxito.",
      enterprise: domainEntity.toAdminDetailJSON(),
    });
  } catch (error) {
    console.error("Error al crear organización:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al registrar la organización en la base de datos.",
    });
  }
}

/**
 * Listado de todas las organizaciones para la Web Admin con filtros y paginación.
 */
async function getAllEnterprises(req, res) {
  try {
    const filterResult = EnterpriseSchemas.validateQueryFilters(req.query);
    const { page, limit, search, status, includeDeleted } = filterResult.success
      ? filterResult.data
      : { page: 1, limit: 20 };

    const skip = (page - 1) * limit;
    const where = {};

    // Filtro de borrado lógico
    if (!includeDeleted && status !== "deleted" && status !== "all") {
      where.is_deleted = false;
    }

    if (status === "deleted") {
      where.is_deleted = true;
    } else if (status === "active") {
      where.is_deleted = false;
      where.is_active = true;
    } else if (status === "inactive") {
      where.is_deleted = false;
      where.is_active = false;
    } else if (status === "verified") {
      where.is_deleted = false;
      where.verified = true;
    }

    // Filtro por búsqueda textual
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { cif: { contains: search } },
        { location: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const [enterprises, total] = await Promise.all([
      prisma.enterprise.findMany({
        where,
        include: {
          role: true,
          _count: {
            select: { serviceEvents: true, platformEvents: true },
          },
        },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.enterprise.count({ where }),
    ]);

    const formatted = enterprises.map((e) => {
      const entity = new EnterpriseUser(e);
      return {
        ...entity.toAdminDetailJSON(),
        serviceEventsCount: e._count?.serviceEvents ?? 0,
        platformEventsCount: e._count?.platformEvents ?? 0,
      };
    });

    return res.status(200).json({
      status: "Success",
      enterprises: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error al obtener organizaciones:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al listar las organizaciones.",
    });
  }
}

/**
 * Detalle completo de una organización (Admin o la propia organización).
 */
async function getEnterpriseById(req, res) {
  try {
    const { id } = req.params;

    const enterprise = await prisma.enterprise.findUnique({
      where: { id },
      include: {
        role: true,
        serviceEvents: {
          take: 10,
          orderBy: { created_at: "desc" },
        },
        platformEvents: {
          take: 10,
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!enterprise) {
      return res.status(404).json({
        status: "Error",
        message: "Organización no encontrada.",
      });
    }

    const entity = new EnterpriseUser(enterprise);
    const data = req.isAdmin
      ? entity.toAdminDetailJSON()
      : entity.toSafeJSON();

    return res.status(200).json({
      status: "Success",
      enterprise: data,
    });
  } catch (error) {
    console.error("Error en getEnterpriseById:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al consultar la organización.",
    });
  }
}

/**
 * Actualización de la organización (Admin o la propia Organización).
 */
async function updateEnterprise(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.enterprise.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        status: "Error",
        message: "Organización no encontrada.",
      });
    }

    const result = EnterpriseSchemas.validateEnterpriseUpdate(req.body);
    if (!result.success) {
      return res.status(400).json({
        status: "Error",
        message: JSON.parse(result.error.message),
      });
    }

    // Doble validación de seguridad anti-IDOR: Si no es admin, solo puede modificar su propia empresa
    if (!req.isAdmin && (!req.enterprise || req.enterprise.id !== id)) {
      return res.status(403).json({
        status: "Error",
        message: "No tienes permisos para acceder o modificar los datos de otra organización.",
      });
    }

    const updates = { ...result.data };

    // Si quien actualiza NO es administrador, despojar de campos restringidos
    if (!req.isAdmin) {
      delete updates.verified;
      delete updates.is_active;
      delete updates.is_deleted;
      delete updates.deleted_at;
      delete updates.role_id;
    }

    delete updates.id;
    delete updates.password;

    // Sanitización de campos opcionales: cadenas vacías a null para evitar violaciones de clave única o inconsistencias
    const nullableFields = [
      "cif",
      "website",
      "phone",
      "logo",
      "location",
      "description",
      "contact_person",
      "sector",
      "address_line1",
      "address_line2",
      "city",
      "province",
      "postal_code",
    ];
    for (const field of nullableFields) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] === "string" && updates[field].trim() === "") {
          updates[field] = null;
        }
      }
    }

    // Validación de unicidad de email si se actualiza
    if (updates.email && updates.email !== existing.email) {
      const emailExists = await prisma.enterprise.findUnique({
        where: { email: updates.email },
      });
      if (emailExists) {
        return res.status(409).json({
          status: "Error",
          message: "El correo electrónico ya está en uso por otra empresa.",
        });
      }
    }

    // Validación de unicidad de CIF si se actualiza
    if (updates.cif && updates.cif !== existing.cif) {
      const cifExists = await prisma.enterprise.findUnique({
        where: { cif: updates.cif },
      });
      if (cifExists) {
        return res.status(409).json({
          status: "Error",
          message: "El CIF proporcionado ya está registrado.",
        });
      }
    }

    const updated = await prisma.enterprise.update({
      where: { id },
      data: updates,
    });

    const entity = new EnterpriseUser(updated);

    return res.status(200).json({
      status: "Success",
      message: "Organización actualizada correctamente.",
      enterprise: entity.toSafeJSON(),
    });
  } catch (error) {
    console.error("Error al actualizar organización:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al actualizar la organización.",
    });
  }
}

/**
 * Borrado Lógico (Soft Delete) de una organización (Solo Admin).
 * Preserva eventos, métricas de movilidad y cálculos de ahorro de emisiones (CAE).
 */
async function softDeleteEnterprise(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.enterprise.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        status: "Error",
        message: "Organización no encontrada.",
      });
    }

    if (existing.is_deleted) {
      return res.status(400).json({
        status: "Error",
        message: "La organización ya se encuentra dada de baja.",
      });
    }

    await prisma.enterprise.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
        is_active: false,
      },
    });

    return res.status(200).json({
      status: "Success",
      message:
        "Organización dada de baja correctamente (borrado lógico aplicado, métricas e histórico preservados).",
    });
  } catch (error) {
    console.error("Error en softDeleteEnterprise:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al eliminar la organización.",
    });
  }
}

/**
 * Restaurar una organización previamente eliminada lógicamente (Solo Admin).
 */
async function restoreEnterprise(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.enterprise.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        status: "Error",
        message: "Organización no encontrada.",
      });
    }

    await prisma.enterprise.update({
      where: { id },
      data: {
        is_deleted: false,
        deleted_at: null,
        is_active: true,
      },
    });

    return res.status(200).json({
      status: "Success",
      message: "Organización reactivada y restaurada con éxito.",
    });
  } catch (error) {
    console.error("Error en restoreEnterprise:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al restaurar la organización.",
    });
  }
}

/**
 * Reseteo administrativo de la contraseña de una empresa (Solo Admin).
 */
async function adminResetPassword(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.enterprise.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        status: "Error",
        message: "Organización no encontrada.",
      });
    }

    const result = EnterpriseSchemas.validateAdminResetPassword(req.body);
    if (!result.success) {
      return res.status(400).json({
        status: "Error",
        message: JSON.parse(result.error.message),
      });
    }

    const hashedPassword = await utils.hashValue(10, result.data.new_password);

    await prisma.enterprise.update({
      where: { id },
      data: {
        password: hashedPassword,
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: "Success",
      message: "Contraseña de la organización restablecida correctamente por el administrador.",
    });
  } catch (error) {
    console.error("Error en adminResetPassword:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al restablecer la contraseña.",
    });
  }
}

/**
 * Métricas agregadas de organizaciones para el panel de control de la Web Admin.
 */
async function getEnterpriseMetrics(req, res) {
  try {
    const [total, active, deleted, verified, totalEvents] = await Promise.all([
      prisma.enterprise.count(),
      prisma.enterprise.count({ where: { is_active: true, is_deleted: false } }),
      prisma.enterprise.count({ where: { is_deleted: true } }),
      prisma.enterprise.count({ where: { verified: true, is_deleted: false } }),
      prisma.platformEvent.count({ where: { enterprise_id: { not: null } } }),
    ]);

    return res.status(200).json({
      status: "Success",
      metrics: {
        totalEnterprises: total,
        activeEnterprises: active,
        deletedEnterprises: deleted,
        verifiedEnterprises: verified,
        totalEventsByEnterprises: totalEvents,
      },
    });
  } catch (error) {
    console.error("Error en getEnterpriseMetrics:", error);
    return res.status(500).json({
      status: "Error",
      message: "Error al calcular las métricas de organizaciones.",
    });
  }
}

async function getMyMetrics(req, res) {
  try {
    const enterpriseId = req.enterprise?.id;
    if (!enterpriseId) {
      return res.status(401).json({
        status: "Error",
        message: "Se requiere autenticación corporativa activa.",
      });
    }

    const now = new Date();

    const [
      totalPlatformEvents,
      activePlatformEvents,
      totalServiceEvents,
      activeServiceEvents,
      membersCount,
      serviceParticipantsCount,
      platformParticipantsCount,
    ] = await Promise.all([
      prisma.platformEvent.count({ where: { enterprise_id: enterpriseId } }),
      prisma.platformEvent.count({
        where: { enterprise_id: enterpriseId, end_date: { gte: now } },
      }),
      prisma.serviceEvent.count({ where: { enterprise_id: enterpriseId } }),
      prisma.serviceEvent.count({
        where: { enterprise_id: enterpriseId, end_at: { gte: now } },
      }),
      prisma.enterpriseMember.count({
        where: { enterprise_id: enterpriseId, status: "ACTIVE" },
      }),
      prisma.serviceEventParticipant.count({
        where: { serviceEvent: { enterprise_id: enterpriseId } },
      }),
      prisma.eventParticipant.count({
        where: { event: { enterprise_id: enterpriseId } },
      }),
    ]);

    const totalEvents = totalPlatformEvents + totalServiceEvents;
    const activeEvents = activePlatformEvents + activeServiceEvents;
    const usersRegistered =
      membersCount + serviceParticipantsCount + platformParticipantsCount;
    const co2Avoided = Number((usersRegistered * 4.2).toFixed(1));

    return res.status(200).json({
      status: "Success",
      usersRegistered,
      users_registered: usersRegistered,
      activeEvents,
      active_events: activeEvents,
      totalEvents,
      total_events: totalEvents,
      co2Avoided,
      co2_avoided: co2Avoided,
    });
  } catch (error) {
    console.error("Error al obtener métricas corporativas:", error);
    return res.status(500).json({
      status: "Error",
      message: "No se pudieron calcular las métricas corporativas.",
    });
  }
}

export const methods = {
  getMe,
  patchMe,
  createEnterpriseByAdmin,
  getAllEnterprises,
  getEnterpriseById,
  updateEnterprise,
  softDeleteEnterprise,
  restoreEnterprise,
  adminResetPassword,
  getEnterpriseMetrics,
  getMyMetrics,
};
