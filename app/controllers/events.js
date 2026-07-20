import dotenv from "dotenv";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { messagesService } from "../services/messagesService.js";
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

async function getAllEvents(req, res) {
  try {
    const { tag, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where = {
      end_date: { gte: new Date() },
    };
    if (search) {
      where.name = { contains: search };
    }
    if (tag) {
      where.tags = {
        some: {
          tag: { name: tag },
        },
      };
    }

    const [events, total] = await Promise.all([
      prisma.platformEvent.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, logo: true } },
          tags: { include: { tag: true } },
        },
        skip,
        take: limitNum,
        orderBy: { start_date: "asc" },
      }),
      prisma.platformEvent.count({ where }),
    ]);

    return res.status(200).send({
      status: "Success",
      events,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getEventById(req, res) {
  try {
    const { id } = req.params;
    const event = await prisma.platformEvent.findUnique({
      where: { id },
      include: {
        company: true,
        tags: { include: { tag: true } },
      },
    });

    if (!event) {
      return res.status(200).send({ status: "Success", event: null });
    }

    return res.status(200).send({ status: "Success", event });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getEventByCode(req, res) {
  try {
    const { code } = req.params;
    const event = await prisma.platformEvent.findUnique({
      where: { unique_code: code },
      include: {
        company: {
          select: { id: true, name: true, logo: true, website: true },
        },
        tags: { include: { tag: true } },
      },
    });

    if (!event) {
      return res
        .status(404)
        .send({ status: "Error", message: "Event not found" });
    }

    return res.status(200).send({ status: "Success", event });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function createEvent(req, res) {
  try {
    const {
      name,
      company_id,
      latitude,
      longitude,
      image,
      description,
      url,
      ticket_url,
      start_date,
      end_date,
      tags = [],
    } = req.body;

    if (!name || !company_id) {
      return res
        .status(400)
        .send({ status: "Error", message: "name and company_id are required" });
    }

    if (!start_date || !end_date) {
      return res.status(400).send({
        status: "Error",
        message: "start_date and end_date are required",
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: company_id },
    });
    if (!company) {
      return res
        .status(404)
        .send({ status: "Error", message: "Company not found" });
    }

    const unique_code = generateUniqueCode();

    const event = await prisma.platformEvent.create({
      data: {
        name,
        company_id,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        image,
        description,
        url,
        ticket_url,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
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
        tags: { include: { tag: true } },
      },
    });

    const adminId = req.user?.id;
    const userToken = req.headers.authorization?.replace("Bearer ", "");
    if (adminId && userToken) {
      const chatId = await messagesService.createEventChat(
        event.id,
        name,
        adminId,
        userToken,
      );
      if (chatId) {
        await prisma.platformEvent.update({
          where: { id: event.id },
          data: { chat_id: chatId },
        });
        event.chat_id = chatId;
      }
    }

    return res.status(201).send({
      status: "Success",
      message: "Event created successfully",
      event,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function updateEvent(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      company_id,
      latitude,
      longitude,
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
      return res
        .status(404)
        .send({ status: "Error", message: "Event not found" });
    }

    if (company_id) {
      const company = await prisma.company.findUnique({
        where: { id: company_id },
      });
      if (!company) {
        return res
          .status(404)
          .send({ status: "Error", message: "Company not found" });
      }
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (company_id !== undefined) data.company_id = company_id;
    if (latitude !== undefined)
      data.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined)
      data.longitude = longitude ? parseFloat(longitude) : null;
    if (image !== undefined) data.image = image;
    if (description !== undefined) data.description = description;
    if (url !== undefined) data.url = url;
    if (ticket_url !== undefined) data.ticket_url = ticket_url;
    if (start_date !== undefined) data.start_date = new Date(start_date);
    if (end_date !== undefined) data.end_date = new Date(end_date);

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
        tags: { include: { tag: true } },
      },
    });

    return res.status(200).send({
      status: "Success",
      message: "Event updated successfully",
      event,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function deleteEvent(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.platformEvent.findUnique({ where: { id } });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Event not found" });
    }

    if (existing.chat_id) {
      const userToken = req.headers.authorization?.replace("Bearer ", "");
      if (userToken) {
        await messagesService.deleteChat(existing.chat_id, userToken);
      }
    }

    await prisma.platformEvent.delete({ where: { id } });

    return res.status(200).send({
      status: "Success",
      message: "Event deleted successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getAllTags(req, res) {
  try {
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
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function createTag(req, res) {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res
        .status(400)
        .send({ status: "Error", message: "name is required" });
    }

    const existing = await prisma.tag.findUnique({ where: { name } });
    if (existing) {
      return res
        .status(409)
        .send({ status: "Error", message: "Tag already exists" });
    }

    const tag = await prisma.tag.create({
      data: { name, description },
    });

    return res.status(201).send({
      status: "Success",
      message: "Tag created successfully",
      tag,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function deleteTag(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.tag.findUnique({
      where: { id: parseInt(id, 10) },
    });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Tag not found" });
    }

    await prisma.tag.delete({ where: { id: parseInt(id, 10) } });

    return res.status(200).send({
      status: "Success",
      message: "Tag deleted successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getNearbyEvents(req, res) {
  try {
    const { lat, lng, radius = 50, tag, limit = 20 } = req.query;

    if (!lat || !lng) {
      return res
        .status(400)
        .send({ status: "Error", message: "lat and lng are required" });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const radiusKm = parseFloat(radius);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = {
      latitude: { not: null },
      longitude: { not: null },
      end_date: { gte: new Date() },
    };
    if (tag) {
      where.tags = { some: { tag: { name: tag } } };
    }

    const events = await prisma.platformEvent.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, logo: true } },
        tags: { include: { tag: true } },
      },
      take: 500,
      orderBy: { created_at: "desc" },
    });

    const nearby = events
      .map((event) => {
        const distance = haversineDistance(
          userLat,
          userLng,
          parseFloat(event.latitude),
          parseFloat(event.longitude),
        );
        return { ...event, distance_km: Math.round(distance * 100) / 100 };
      })
      .filter((event) => event.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, limitNum);

    return res.status(200).send({
      status: "Success",
      events: nearby,
      pagination: {
        total: nearby.length,
        limit: limitNum,
        radius_km: radiusKm,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function joinEvent(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const event = await prisma.platformEvent.findUnique({ where: { id } });
    if (!event) {
      return res
        .status(404)
        .send({ status: "Error", message: "Event not found" });
    }

    const existing = await prisma.eventParticipant.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: id } },
    });
    if (existing) {
      return res
        .status(409)
        .send({ status: "Error", message: "Already joined this event" });
    }

    await prisma.eventParticipant.create({
      data: { user_id: userId, event_id: id },
    });

    if (event.chat_id) {
      const userToken = req.headers.authorization?.replace("Bearer ", "");
      if (userToken) {
        await messagesService.joinChat(event.chat_id, userToken);
      }
    }

    return res
      .status(201)
      .send({ status: "Success", message: "Joined event successfully" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function leaveEvent(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.eventParticipant.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: id } },
    });
    if (!existing) {
      return res
        .status(404)
        .send({ status: "Error", message: "Not joined this event" });
    }

    await prisma.eventParticipant.delete({
      where: { user_id_event_id: { user_id: userId, event_id: id } },
    });

    const event = await prisma.platformEvent.findUnique({
      where: { id },
      select: { chat_id: true },
    });
    if (event?.chat_id) {
      const userToken = req.headers.authorization?.replace("Bearer ", "");
      if (userToken) {
        await messagesService.leaveChat(event.chat_id, userToken);
      }
    }

    return res
      .status(200)
      .send({ status: "Success", message: "Left event successfully" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getEventParticipants(req, res) {
  try {
    const { id } = req.params;

    const event = await prisma.platformEvent.findUnique({ where: { id } });
    if (!event) {
      return res
        .status(404)
        .send({ status: "Error", message: "Event not found" });
    }

    const participants = await prisma.eventParticipant.findMany({
      where: { event_id: id },
      include: {
        user: { select: { id: true, name: true, img_perfil: true } },
      },
      orderBy: { joined_at: "desc" },
    });

    return res.status(200).send({
      status: "Success",
      participants: participants.map((p) => ({
        ...p.user,
        joined_at: p.joined_at,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

async function getMyJoinedEvents(req, res) {
  try {
    const userId = req.user.id;

    const participations = await prisma.eventParticipant.findMany({
      where: {
        user_id: userId,
        event: { end_date: { gte: new Date() } },
      },
      include: {
        event: {
          include: {
            company: { select: { id: true, name: true, logo: true } },
            tags: { include: { tag: true } },
          },
        },
      },
      orderBy: { event: { start_date: "asc" } },
    });

    const events = participations.map((p) => ({
      ...p.event,
      joined_at: p.joined_at,
    }));

    return res.status(200).send({ status: "Success", events });
  } catch (error) {
    return res
      .status(500)
      .send({ status: "Error", message: error?.message ?? String(error) });
  }
}

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
  getMyJoinedEvents,
};
