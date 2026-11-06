import dotenv from "dotenv";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { messagesService } from "../services/messagesService.js";
import { eventBus } from "../services/eventBus.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import parseUTCDate from "../utils/parseUTCDate.js";
import { GeoPoint } from "../utils/geoPoint.js";
import {
  findNearbyEvents,
  findNearbyPlatformEvents,
} from "../services/geoSpatialService.js";
import {
  mapServiceEventToStandardEvent,
  normalizePlatformEvent,
} from "../adapters/serviceEventAdapter.js";
import { GoogleMapsProvider } from "../providers/google-maps.js";
import { methods as cryptoUtils } from "../utils/crypto.js";
import { enterpriseAuthorization } from "../middlewares/enterpriseAuthorization.js";
dotenv.config();

function generateUniqueCode() {
  return crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 12);
}

const EARTH_RADIUS_KM = 6371;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const getAllEvents = catchAsync(async (req, res, next) => {
  const { tag, search, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Filtros para platform_events
  const platformWhere = {
    end_date: { gte: new Date() },
  };
  if (search) {
    platformWhere.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
      { company: { name: { contains: search } } },
      { enterprise: { name: { contains: search } } },
    ];
  }
  if (tag) {
    platformWhere.tags = {
      some: {
        tag: { name: tag },
      },
    };
  }

  // Filtros para service_events (organizaciones)
  // Se incluyen si no hay filtro de tag o si el tag es "corporativo"
  const isCorporateTag = !tag || tag.toLowerCase() === "corporativo";
  let serviceWhere = null;

  if (isCorporateTag) {
    serviceWhere = {
      OR: [
        { end_at: { gte: new Date() } },
        { end_at: null, start_at: { gte: new Date() } },
      ],
      status: { in: ["approved", "requested"] },
    };
    if (search) {
      serviceWhere.AND = [
        {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { venue_name: { contains: search } },
            { address_line1: { contains: search } },
            { city: { contains: search } },
            { enterprise: { name: { contains: search } } },
          ],
        },
      ];
    }
  }

  const fetchLimit = skip + limitNum;

  // Ejecución en paralelo de ambas consultas
  const platformPromise = prisma.platformEvent.findMany({
    where: platformWhere,
    include: {
      company: { select: { id: true, name: true, website: true } },
      enterprise: {
        select: { id: true, name: true, website: true },
      },
      tags: { include: { tag: true } },
    },
    orderBy: { start_date: "asc" },
    take: fetchLimit,
  });
  const platformCountPromise = prisma.platformEvent.count({
    where: platformWhere,
  });

  const servicePromise = serviceWhere
    ? prisma.serviceEvent.findMany({
        where: serviceWhere,
        include: {
          enterprise: {
            select: { id: true, name: true, website: true },
          },
        },
        orderBy: { start_at: "asc" },
        take: fetchLimit,
      })
    : Promise.resolve([]);

  const serviceCountPromise = serviceWhere
    ? prisma.serviceEvent.count({ where: serviceWhere })
    : Promise.resolve(0);

  const [platformEvents, totalPlatform, serviceEvents, totalService] =
    await Promise.all([
      platformPromise,
      platformCountPromise,
      servicePromise,
      serviceCountPromise,
    ]);

  // Normalización polimórfica de eventos a la misma estructura
  const mappedPlatformEvents = platformEvents.map((pe) =>
    normalizePlatformEvent(pe),
  );
  const mappedServiceEvents = serviceEvents.map((se) =>
    mapServiceEventToStandardEvent(se),
  );

  const allCombined = [...mappedPlatformEvents, ...mappedServiceEvents].sort(
    (a, b) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );

  const total = totalPlatform + totalService;
  const paginatedEvents = allCombined.slice(skip, skip + limitNum);

  return res.status(200).send({
    status: "Success",
    events: paginatedEvents,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

const getEventById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // 1. Resolver usuario o empresa autenticada de forma opcional (no bloqueante)
  const user = req.user || null;
  let enterprise = req.enterprise || null;
  if (!enterprise) {
    try {
      const revised = await enterpriseAuthorization.reviseEnterprise(req);
      if (revised) enterprise = revised;
    } catch (_e) {
      // Ignorar error de verificación opcional
    }
  }

  // 2. Búsqueda en platform_events
  const rawEvent = await prisma.platformEvent.findUnique({
    where: { id },
    include: {
      company: {
        select: { id: true, name: true, logo: true, website: true },
      },
      enterprise: {
        select: {
          id: true,
          name: true,
          logo: true,
          website: true,
          cif: true,
          email: true,
          phone: true,
        },
      },
      tags: { include: { tag: true } },
    },
  });

  let event = null;
  let isPlatformEvent = false;

  if (rawEvent) {
    event = normalizePlatformEvent(rawEvent);
    isPlatformEvent = true;
  } else {
    // Fallback a eventos de servicio corporativo (service_events)
    const serviceEvent = await prisma.serviceEvent.findUnique({
      where: { id },
      include: {
        enterprise: {
          select: {
            id: true,
            name: true,
            logo: true,
            website: true,
            cif: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (serviceEvent) {
      event = mapServiceEventToStandardEvent(serviceEvent);
    }
  }

  if (!event) {
    return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
  }

  // 3. Determinar si el solicitante es el organizador del evento o administrador
  const isAdmin = user?.role?.name === "admin" || req.isAdmin || false;
  const isOwnerEnterprise =
    enterprise &&
    (String(event.enterprise_id) === String(enterprise.id) ||
      String(event.company_id) === String(enterprise.id));
  const isOwnerUserCompany =
    user?.company_id && String(event.company_id) === String(user.company_id);
  const isOrganizer = Boolean(isAdmin || isOwnerEnterprise || isOwnerUserCompany);

  // 4. Obtener participantes inscritos en el evento (de la base de datos de usuarios)
  let participantsList = [];
  const participantSelect = {
    id: true,
    name: true,
    surname: true,
    email: true,
    phone: true,
    img_perfil: true,
    ciudad: true,
    provincia: true,
  };

  const participantsData = isPlatformEvent
    ? await prisma.eventParticipant.findMany({
        where: { event_id: id },
        include: { user: { select: participantSelect } },
        orderBy: { joined_at: "desc" },
      })
    : await prisma.serviceEventParticipant.findMany({
        where: { service_event_id: id },
        include: { user: { select: participantSelect } },
        orderBy: { joined_at: "desc" },
      });

  participantsList = (participantsData || []).map((p) => {
    const decryptedUser = cryptoUtils.decryptFields(p.user, [
      "name",
      "surname",
      "email",
      "phone",
      "ciudad",
      "provincia",
    ]);

    const participantObj = {
      id: decryptedUser.id,
      name: decryptedUser.name || "Usuario",
      surname: decryptedUser.surname || "",
      img_perfil: decryptedUser.img_perfil || null,
      ciudad: decryptedUser.ciudad || null,
      provincia: decryptedUser.provincia || null,
      joined_at: p.joined_at,
    };

    // Si quien consulta es la organización organizadora o admin, incluir datos de contacto
    if (isOrganizer) {
      participantObj.email = decryptedUser.email || null;
      participantObj.phone = decryptedUser.phone || null;
    }

    return participantObj;
  });

  const totalParticipants = participantsList.length;

  // 5. Estado de sesión del usuario con respecto al evento
  const hasJoined = user
    ? participantsList.some((p) => String(p.id) === String(user.id))
    : false;

  // 6. Ensamblado de propiedades completas y métricas organizacionales
  const enrichedEvent = {
    ...event,
    has_joined: hasJoined,
    is_organizer: isOrganizer,
    total_participants: totalParticipants,
    participants: participantsList,
  };

  return res.status(200).send({
    status: "Success",
    event: enrichedEvent,
    participants: participantsList,
    total_participants: totalParticipants,
    has_joined: hasJoined,
    is_organizer: isOrganizer,
  });
});

const getEventByCode = catchAsync(async (req, res, next) => {
  const { code } = req.params;
  const trimmedCode = String(code).trim();

  let event = await prisma.platformEvent.findUnique({
    where: { unique_code: trimmedCode },
    include: {
      company: {
        select: { id: true, name: true, logo: true, website: true },
      },
      enterprise: {
        select: { id: true, name: true, logo: true, website: true },
      },
      tags: { include: { tag: true } },
    },
  });

  if (event) {
    event = normalizePlatformEvent(event);
    return res.status(200).send({ status: "Success", event });
  }

  // Fallback a eventos corporativos (por código ORG-XXXXXXXX o prefijo de ID)
  const cleanCode = trimmedCode.replace(/^ORG-/i, "");
  const serviceEvent = await prisma.serviceEvent.findFirst({
    where: {
      OR: [{ id: trimmedCode }, { id: { startsWith: cleanCode } }],
    },
    include: {
      enterprise: true,
    },
  });

  if (serviceEvent) {
    event = mapServiceEventToStandardEvent(serviceEvent);
    return res.status(200).send({ status: "Success", event });
  }

  return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
});

const createEvent = catchAsync(async (req, res, next) => {
  const {
    name,
    company_id,
    latitude,
    longitude,
    location,
    address,
    image,
    description,
    url,
    ticket_url,
    start_date,
    end_date,
    tags = [],
  } = req.body;

  // 1. Determinar el creador del evento (Empresa/Organizador o Admin)
  const isEnterprise = Boolean(req.enterprise);
  let enterpriseId = req.enterprise?.id || req.body.enterprise_id || null;
  let targetCompanyId = company_id || null;

  if (targetCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyId },
    });
    if (!company) {
      // Si no es una Company convencional, verificar si corresponde a una Enterprise
      const ent = await prisma.enterprise.findUnique({
        where: { id: targetCompanyId },
      });
      if (ent) {
        enterpriseId = ent.id;
        targetCompanyId = null;
      } else {
        targetCompanyId = null;
      }
    }
  }

  if (!isEnterprise && !enterpriseId && !targetCompanyId) {
    return next(
      new AppError(
        "Se requiere un organizador (enterprise_id o company_id) para crear el evento",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  if (!name) {
    return next(
      new AppError(
        "El nombre del evento es obligatorio",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  if (!start_date || !end_date) {
    return next(
      new AppError(
        "Las fechas start_date y end_date son obligatorias",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  const startDate = parseUTCDate(start_date);
  const endDate = parseUTCDate(end_date);

  if (endDate < startDate) {
    return next(
      new AppError(
        "La fecha de finalización (end_date) debe ser posterior o igual a la de inicio (start_date)",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  if (targetCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyId },
    });
    if (!company) {
      targetCompanyId = null;
    }
  }

  if (enterpriseId) {
    const enterprise = await prisma.enterprise.findUnique({
      where: { id: enterpriseId },
    });
    if (!enterprise) {
      return next(
        new AppError("Enterprise not found", 404, "ENTERPRISE_NOT_FOUND"),
      );
    }
    if (enterprise.is_deleted || !enterprise.is_active) {
      return next(
        new AppError(
          "La empresa organizadora está inactiva o dada de baja",
          403,
          "FORBIDDEN",
        ),
      );
    }
  }

  // 2. Geocodificación inteligente si no se proporcionan coordenadas explícitas
  let lat = latitude ? parseFloat(latitude) : null;
  let lng = longitude ? parseFloat(longitude) : null;
  const addressToGeocode = location || address;

  if ((lat == null || lng == null) && addressToGeocode) {
    try {
      const coords = await GoogleMapsProvider.geocodeAddress(addressToGeocode);
      if (coords?.lat && coords?.lng) {
        lat = coords.lat;
        lng = coords.lng;
      }
    } catch (_geoError) {
      // Continuar con coordenadas nulas si geocodificación falla
    }
  }

  const unique_code = generateUniqueCode();

  const event = await prisma.platformEvent.create({
    data: {
      name,
      company_id: targetCompanyId,
      enterprise_id: enterpriseId,
      latitude: lat,
      longitude: lng,
      image,
      description,
      url,
      ticket_url,
      start_date: startDate,
      end_date: endDate,
      unique_code,
      tags:
        tags.length > 0
          ? {
              create: tags.map((tagId) => ({ tag_id: tagId })),
            }
          : undefined,
    },
    include: {
      company: { select: { id: true, name: true } },
      enterprise: { select: { id: true, name: true, logo: true } },
      tags: { include: { tag: true } },
    },
  });

  const creatorId = req.user?.id || req.enterprise?.id;
  const userToken = req.headers.authorization?.replace("Bearer ", "");
  if (creatorId && userToken) {
    try {
      const chatId = await messagesService.createEventChat(
        event.id,
        name,
        creatorId,
        userToken,
      );
      if (chatId) {
        await prisma.platformEvent.update({
          where: { id: event.id },
          data: { chat_id: chatId },
        });
        event.chat_id = chatId;
      }
    } catch (_chatErr) {
      // Continuar si el microservicio de chat no responde
    }
  }

  await eventBus.platformEventCreated(
    event.id,
    event.name,
    event.company_id || event.enterprise_id,
    event.unique_code,
  );

  return res.status(201).send({
    status: "Success",
    message: "Event created successfully",
    event,
  });
});

const updateEvent = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const {
    name,
    company_id,
    latitude,
    longitude,
    location,
    address,
    image,
    description,
    url,
    ticket_url,
    start_date,
    end_date,
    tags,
  } = req.body;

  const existing = await prisma.platformEvent.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
  }

  // Verificación de permisos: Admin o empresa propietaria
  const isAdmin = req.user?.role?.name === "admin" || req.isAdmin;
  const isOwner =
    req.enterprise &&
    String(existing.enterprise_id) === String(req.enterprise.id);

  if (!isAdmin && !isOwner) {
    return next(
      new AppError(
        "No tienes permisos para modificar este evento.",
        403,
        "FORBIDDEN",
      ),
    );
  }

  if (company_id && isAdmin) {
    const company = await prisma.company.findUnique({
      where: { id: company_id },
    });
    if (!company) {
      return next(new AppError("Company not found", 404, "COMPANY_NOT_FOUND"));
    }
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (company_id !== undefined && isAdmin) data.company_id = company_id;
  if (latitude !== undefined)
    data.latitude = latitude ? parseFloat(latitude) : null;
  if (longitude !== undefined)
    data.longitude = longitude ? parseFloat(longitude) : null;

  // Geocodificación si se actualiza la dirección sin coordenadas
  const addressToGeocode = location || address;
  if (addressToGeocode && latitude === undefined && longitude === undefined) {
    try {
      const coords = await GoogleMapsProvider.geocodeAddress(addressToGeocode);
      if (coords?.lat && coords?.lng) {
        data.latitude = coords.lat;
        data.longitude = coords.lng;
      }
    } catch (_e) {
      // Continuar sin modificar lat/lng
    }
  }

  if (image !== undefined) data.image = image;
  if (description !== undefined) data.description = description;
  if (url !== undefined) data.url = url;
  if (ticket_url !== undefined) data.ticket_url = ticket_url;
  if (start_date !== undefined) data.start_date = parseUTCDate(start_date);
  if (end_date !== undefined) data.end_date = parseUTCDate(end_date);

  if (data.start_date && data.end_date && data.end_date < data.start_date) {
    return next(
      new AppError(
        "La fecha de finalización debe ser posterior o igual a la de inicio",
        400,
        "VALIDATION_ERROR",
      ),
    );
  }

  if (tags !== undefined) {
    await prisma.eventTag.deleteMany({ where: { event_id: id } });
    if (tags.length > 0) {
      data.tags = {
        create: tags.map((tagId) => ({ tag_id: tagId })),
      };
    }
  }

  const event = await prisma.platformEvent.update({
    where: { id },
    data,
    include: {
      company: { select: { id: true, name: true } },
      enterprise: { select: { id: true, name: true, logo: true } },
      tags: { include: { tag: true } },
    },
  });

  await eventBus.platformEventUpdated(id, data);

  return res.status(200).send({
    status: "Success",
    message: "Event updated successfully",
    event,
  });
});

const deleteEvent = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const existing = await prisma.platformEvent.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
  }

  // Verificación de permisos: Admin o empresa propietaria
  const isAdmin = req.user?.role?.name === "admin" || req.isAdmin;
  const isOwner =
    req.enterprise &&
    String(existing.enterprise_id) === String(req.enterprise.id);

  if (!isAdmin && !isOwner) {
    return next(
      new AppError(
        "No tienes permisos para eliminar este evento.",
        403,
        "FORBIDDEN",
      ),
    );
  }

  if (existing.chat_id) {
    const userToken = req.headers.authorization?.replace("Bearer ", "");
    if (userToken) {
      await messagesService.deleteChat(existing.chat_id, userToken);
    }
  }

  await prisma.platformEvent.delete({ where: { id } });

  await eventBus.platformEventDeleted(id);

  return res.status(200).send({
    status: "Success",
    message: "Event deleted successfully",
  });
});

/**
 * Consulta de eventos creados por la empresa/organización en sesión.
 */
const getMyEnterpriseEvents = catchAsync(async (req, res, next) => {
  const enterpriseId = req.enterprise?.id;
  if (!enterpriseId) {
    return next(
      new AppError(
        "Se requiere autenticación como organización",
        401,
        "UNAUTHORIZED",
      ),
    );
  }

  const { page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;
  const fetchLimit = skip + limitNum;

  const [platformEvents, totalPlatform, serviceEvents, totalService] =
    await Promise.all([
      prisma.platformEvent.findMany({
        where: { enterprise_id: enterpriseId },
        include: {
          tags: { include: { tag: true } },
          enterprise: {
            select: { id: true, name: true, website: true },
          },
          _count: { select: { participants: true } },
        },
        orderBy: { start_date: "asc" },
        take: fetchLimit,
      }),
      prisma.platformEvent.count({ where: { enterprise_id: enterpriseId } }),
      prisma.serviceEvent.findMany({
        where: { enterprise_id: enterpriseId },
        include: {
          enterprise: {
            select: { id: true, name: true, website: true },
          },
          _count: { select: { participants: true } },
        },
        orderBy: { start_at: "asc" },
        take: fetchLimit,
      }),
      prisma.serviceEvent.count({ where: { enterprise_id: enterpriseId } }),
    ]);

  const mappedPlatform = platformEvents.map((pe) => {
    const norm = normalizePlatformEvent(pe);
    const count = pe._count?.participants ?? 0;
    return {
      ...norm,
      total_participants: count,
      participants_count: count,
      inscribed_count: count,
      _count: { participants: count },
    };
  });

  const mappedService = serviceEvents.map((se) => {
    const norm = mapServiceEventToStandardEvent(se);
    const count = se._count?.participants ?? 0;
    return {
      ...norm,
      total_participants: count,
      participants_count: count,
      inscribed_count: count,
      _count: { participants: count },
    };
  });

  const allCombined = [...mappedPlatform, ...mappedService].sort(
    (a, b) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );

  const total = totalPlatform + totalService;
  const paginatedEvents = allCombined.slice(skip, skip + limitNum);

  return res.status(200).json({
    status: "Success",
    events: paginatedEvents,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

const getAllTags = catchAsync(async (req, res, next) => {
  const { search } = req.query;

  const where = {};
  if (search) {
    where.name = { contains: search };
  }

  const tags = await prisma.tag.findMany({
    where,
    orderBy: { name: "asc" },
  });
  return res.status(200).send({ status: "Success", tags });
});

const createTag = catchAsync(async (req, res, next) => {
  const { name, description } = req.body;

  if (!name) {
    return next(new AppError("name is required", 400, "VALIDATION_ERROR"));
  }

  const existing = await prisma.tag.findUnique({ where: { name } });
  if (existing) {
    return next(new AppError("Tag already exists", 409, "TAG_ALREADY_EXISTS"));
  }

  const tag = await prisma.tag.create({
    data: { name, description },
  });

  return res.status(201).send({
    status: "Success",
    message: "Tag created successfully",
    tag,
  });
});

const deleteTag = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const existing = await prisma.tag.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (!existing) {
    return next(new AppError("Tag not found", 404, "TAG_NOT_FOUND"));
  }

  await prisma.tag.delete({ where: { id: parseInt(id, 10) } });

  return res.status(200).send({
    status: "Success",
    message: "Tag deleted successfully",
  });
});

const getNearbyEvents = catchAsync(async (req, res, next) => {
  const {
    lat,
    lng,
    radius = 50,
    search,
    tag,
    limit = 20,
    page = 1,
  } = req.query;

  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return next(
      new AppError("lat and lng are required", 400, "VALIDATION_ERROR"),
    );
  }

  let userPoint;
  try {
    userPoint = new GeoPoint(lat, lng);
  } catch (err) {
    return next(new AppError(err.message, 400, "VALIDATION_ERROR"));
  }

  const radiusKm = Math.max(0.1, parseFloat(radius) || 50);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const { events, total, totalPages } = await findNearbyEvents({
    point: userPoint,
    radiusKm,
    search,
    tag,
    page: pageNum,
    limit: limitNum,
  });

  return res.status(200).send({
    status: "Success",
    events,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      radius_km: radiusKm,
    },
  });
});

const joinEvent = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const event = await prisma.platformEvent.findUnique({ where: { id } });
  if (event) {
    const existing = await prisma.eventParticipant.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: id } },
    });
    if (existing) {
      return next(
        new AppError("Already joined this event", 409, "ALREADY_JOINED_EVENT"),
      );
    }

    await prisma.eventParticipant.create({
      data: { user_id: userId, event_id: id },
    });

    await eventBus.platformEventJoined(id, userId);

    if (event.chat_id) {
      const userToken = req.headers.authorization?.replace("Bearer ", "");
      if (userToken) {
        await messagesService.joinChat(event.chat_id, userToken);
      }
    }

    return res
      .status(201)
      .send({ status: "Success", message: "Joined event successfully" });
  }

  // Si no es un evento de plataforma, buscar en eventos corporativos de servicio
  const serviceEvent = await prisma.serviceEvent.findUnique({
    where: { id },
  });

  if (!serviceEvent) {
    return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
  }

  const existingService = await prisma.serviceEventParticipant.findUnique({
    where: {
      user_id_service_event_id: { user_id: userId, service_event_id: id },
    },
  });

  if (existingService) {
    return next(
      new AppError("Already joined this event", 409, "ALREADY_JOINED_EVENT"),
    );
  }

  await prisma.serviceEventParticipant.create({
    data: { user_id: userId, service_event_id: id },
  });

  await eventBus.platformEventJoined(id, userId);

  return res
    .status(201)
    .send({ status: "Success", message: "Joined event successfully" });
});

const leaveEvent = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const event = await prisma.platformEvent.findUnique({
    where: { id },
    select: { chat_id: true },
  });

  if (event) {
    const existing = await prisma.eventParticipant.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: id } },
    });
    if (!existing) {
      return next(new AppError("Not joined this event", 404, "NOT_JOINED_EVENT"));
    }

    await prisma.eventParticipant.delete({
      where: { user_id_event_id: { user_id: userId, event_id: id } },
    });

    await eventBus.platformEventLeft(id, userId);

    if (event.chat_id) {
      const userToken = req.headers.authorization?.replace("Bearer ", "");
      if (userToken) {
        await messagesService.leaveChat(event.chat_id, userToken);
      }
    }

    return res
      .status(200)
      .send({ status: "Success", message: "Left event successfully" });
  }

  // Si es un evento de servicio corporativo
  const serviceEvent = await prisma.serviceEvent.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!serviceEvent) {
    return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
  }

  const existingService = await prisma.serviceEventParticipant.findUnique({
    where: {
      user_id_service_event_id: { user_id: userId, service_event_id: id },
    },
  });

  if (!existingService) {
    return next(new AppError("Not joined this event", 404, "NOT_JOINED_EVENT"));
  }

  await prisma.serviceEventParticipant.delete({
    where: {
      user_id_service_event_id: { user_id: userId, service_event_id: id },
    },
  });

  await eventBus.platformEventLeft(id, userId);

  return res
    .status(200)
    .send({ status: "Success", message: "Left event successfully" });
});

const PUBLIC_PARTICIPANT_SELECT = {
  id: true,
  name: true,
  img_perfil: true,
};

const PRIVATE_PARTICIPANT_SELECT = {
  ...PUBLIC_PARTICIPANT_SELECT,
  ciudad: true,
  provincia: true,
};

const buildParticipantsHandler = (userSelect) =>
  catchAsync(async (req, res, next) => {
    const { id } = req.params;

    const event = await prisma.platformEvent.findUnique({ where: { id } });
    if (!event) {
      // Verificar si es un evento de servicio corporativo
      const isService = await prisma.serviceEvent.findUnique({
        where: { id },
        select: { id: true },
      });
      if (isService) {
        const serviceParticipants =
          await prisma.serviceEventParticipant.findMany({
            where: { service_event_id: id },
            include: { user: { select: userSelect } },
            orderBy: { joined_at: "desc" },
          });

        const decryptedList = serviceParticipants.map((p) => {
          const decryptedUser = p.user
            ? cryptoUtils.decryptFields(p.user, [
                "name",
                "surname",
                "ciudad",
                "provincia",
              ])
            : {};
          return {
            ...decryptedUser,
            joined_at: p.joined_at,
          };
        });

        return res.status(200).send({
          status: "Success",
          participants: decryptedList,
        });
      }
      return next(new AppError("Event not found", 404, "EVENT_NOT_FOUND"));
    }

    const participants = await prisma.eventParticipant.findMany({
      where: { event_id: id },
      include: { user: { select: userSelect } },
      orderBy: { joined_at: "desc" },
    });

    const decryptedParticipants = participants.map((p) => {
      const decryptedUser = p.user
        ? cryptoUtils.decryptFields(p.user, [
            "name",
            "surname",
            "ciudad",
            "provincia",
          ])
        : {};
      return {
        ...decryptedUser,
        joined_at: p.joined_at,
      };
    });

    return res.status(200).send({
      status: "Success",
      participants: decryptedParticipants,
    });
  });

const getEventParticipants = buildParticipantsHandler(
  PUBLIC_PARTICIPANT_SELECT,
);

const getEventParticipantsDetailed = buildParticipantsHandler(
  PRIVATE_PARTICIPANT_SELECT,
);

const getMyJoinedEvents = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const now = new Date();

  const [platformParticipations, serviceParticipations] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: {
        user_id: userId,
        event: { end_date: { gte: now } },
      },
      include: {
        event: {
          include: {
            company: {
              select: { id: true, name: true, logo: true, website: true },
            },
            enterprise: {
              select: { id: true, name: true, logo: true, website: true },
            },
            tags: { include: { tag: true } },
          },
        },
      },
      orderBy: { event: { start_date: "asc" } },
    }),
    prisma.serviceEventParticipant.findMany({
      where: {
        user_id: userId,
        serviceEvent: {
          OR: [
            { end_at: { gte: now } },
            { end_at: null, start_at: { gte: now } },
          ],
        },
      },
      include: {
        serviceEvent: {
          include: {
            enterprise: {
              select: { id: true, name: true, logo: true, website: true },
            },
          },
        },
      },
      orderBy: { serviceEvent: { start_at: "asc" } },
    }),
  ]);

  const mappedPlatform = platformParticipations.map((p) => ({
    ...normalizePlatformEvent(p.event),
    joined_at: p.joined_at,
  }));

  const mappedService = serviceParticipations.map((p) => ({
    ...mapServiceEventToStandardEvent(p.serviceEvent),
    joined_at: p.joined_at,
  }));

  const allEvents = [...mappedPlatform, ...mappedService].sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date),
  );

  return res.status(200).send({ status: "Success", events: allEvents });
});

export const methods = {
  getAllEvents,
  getEventById,
  getEventByCode,
  getNearbyEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getAllTags,
  createTag,
  deleteTag,
  joinEvent,
  leaveEvent,
  getEventParticipants,
  getEventParticipantsDetailed,
  getMyJoinedEvents,
  getMyEnterpriseEvents,
};
