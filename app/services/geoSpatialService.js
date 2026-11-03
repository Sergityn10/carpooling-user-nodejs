import prisma from "../lib/prisma.js";

/**
 * Busca eventos cercanos (tanto de plataforma como corporativos de organizaciones)
 * usando optimización R-Tree nativa en MySQL 8.
 *
 * Emplea un enfoque en dos fases de alta eficiencia:
 * 1. MBRContains con polígono envolvente (Bounding Box envelope) forzando el índice espacial R-Tree (O(log N))
 * 2. ST_Distance_Sphere para filtrado preciso por radio circular y cálculo de distancia métrica
 *
 * Soporta filtros opcionales de búsqueda por texto (search) y por etiqueta (tag).
 *
 * @param {Object} params
 * @param {Object} params.point - GeoPoint instance
 * @param {number} params.radiusKm - Radio de búsqueda en km
 * @param {string} [params.search] - Texto de búsqueda libre (nombre, descripción, empresa, ciudad, etc.)
 * @param {string} [params.tag] - Etiqueta opcional para filtrar
 * @param {number} params.page - Número de página (1-based)
 * @param {number} params.limit - Límite de resultados por página
 * @returns {Promise<{events: Array, total: number, totalPages: number}>}
 */
export async function findNearbyEvents({
  point,
  radiusKm,
  search,
  tag,
  page = 1,
  limit = 20,
}) {
  const radiusMeters = radiusKm * 1000;
  const envelopeWkt = point.toEnvelopePolygonWKT(radiusKm);
  const pointWkt = point.toWKT();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Escapar parámetros para raw SQL
  const safeSearch = search ? String(search).replace(/'/g, "''").trim() : null;
  const safeTag = tag ? String(tag).replace(/'/g, "''").trim() : null;

  // Condiciones para platform_events
  const platformTagCondition = safeTag
    ? `AND EXISTS (
        SELECT 1 FROM event_tags et
        JOIN tags t ON et.tag_id = t.id
        WHERE et.event_id = pe.id AND t.name = '${safeTag}'
      )`
    : "";

  const platformSearchCondition = safeSearch
    ? `AND (
        pe.name LIKE '%${safeSearch}%'
        OR pe.description LIKE '%${safeSearch}%'
        OR c.name LIKE '%${safeSearch}%'
        OR ent.name LIKE '%${safeSearch}%'
      )`
    : "";

  // Condiciones para service_events
  const isCorporateTag =
    !safeTag || safeTag.toLowerCase() === "corporativo";

  const serviceSearchCondition = safeSearch
    ? `AND (
        se.title LIKE '%${safeSearch}%'
        OR se.description LIKE '%${safeSearch}%'
        OR se.venue_name LIKE '%${safeSearch}%'
        OR se.address_line1 LIKE '%${safeSearch}%'
        OR se.city LIKE '%${safeSearch}%'
        OR e.name LIKE '%${safeSearch}%'
      )`
    : "";

  const platformSubquery = `
    SELECT
      pe.id,
      pe.name,
      pe.unique_code,
      pe.description,
      pe.image,
      pe.url,
      pe.ticket_url,
      pe.start_date,
      pe.end_date,
      pe.latitude,
      pe.longitude,
      c.id AS company_id,
      COALESCE(c.name, ent.name, 'Organizador') AS company_name,
      COALESCE(c.logo, ent.logo) AS company_logo,
      c.website AS company_website,
      pe.enterprise_id,
      ent.name AS enterprise_name,
      ent.logo AS enterprise_logo,
      ent.website AS enterprise_website,
      'platform_event' AS event_type,
      COALESCE(c.name, ent.name, 'Recinto Principal') AS location_name,
      NULL AS address,
      ROUND(
        ST_Distance_Sphere(
          pe.location,
          ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
        ) / 1000, 2
      ) AS distance_km
    FROM platform_events pe FORCE INDEX (idx_platform_events_location)
    LEFT JOIN companies c ON pe.company_id = c.id
    LEFT JOIN enterprises ent ON pe.enterprise_id = ent.id
    WHERE MBRContains(
        ST_GeomFromText('${envelopeWkt}', 4326, 'axis-order=long-lat'),
        pe.location
      )
      AND ST_Distance_Sphere(
        pe.location,
        ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
      ) <= ${radiusMeters}
      AND pe.end_date >= NOW()
      ${platformTagCondition}
      ${platformSearchCondition}
  `;

  const serviceSubquery = `
    SELECT
      se.id,
      se.title AS name,
      CONCAT('ORG-', UPPER(SUBSTRING(se.id, 1, 8))) AS unique_code,
      se.description,
      se.image,
      e.website AS url,
      NULL AS ticket_url,
      se.start_at AS start_date,
      COALESCE(se.end_at, se.start_at) AS end_date,
      se.latitude,
      se.longitude,
      e.id AS company_id,
      COALESCE(e.name, 'Organización') AS company_name,
      e.logo AS company_logo,
      e.website AS company_website,
      se.enterprise_id,
      e.name AS enterprise_name,
      e.logo AS enterprise_logo,
      e.website AS enterprise_website,
      'service_event' AS event_type,
      COALESCE(se.venue_name, se.address_line1, se.city, 'Sede Corporativa') AS location_name,
      se.address_line1 AS address,
      ROUND(
        ST_Distance_Sphere(
          se.location,
          ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
        ) / 1000, 2
      ) AS distance_km
    FROM service_events se FORCE INDEX (idx_service_events_location)
    LEFT JOIN enterprises e ON se.enterprise_id = e.id
    WHERE MBRContains(
        ST_GeomFromText('${envelopeWkt}', 4326, 'axis-order=long-lat'),
        se.location
      )
      AND ST_Distance_Sphere(
        se.location,
        ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
      ) <= ${radiusMeters}
      AND COALESCE(se.end_at, se.start_at) >= NOW()
      AND se.status IN ('approved', 'requested')
      ${serviceSearchCondition}
  `;

  let combinedQuery = "";
  let platformCountQuery = `
    SELECT COUNT(*) as total
    FROM platform_events pe FORCE INDEX (idx_platform_events_location)
    LEFT JOIN companies c ON pe.company_id = c.id
    LEFT JOIN enterprises ent ON pe.enterprise_id = ent.id
    WHERE MBRContains(
        ST_GeomFromText('${envelopeWkt}', 4326, 'axis-order=long-lat'),
        pe.location
      )
      AND ST_Distance_Sphere(
        pe.location,
        ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
      ) <= ${radiusMeters}
      AND pe.end_date >= NOW()
      ${platformTagCondition}
      ${platformSearchCondition};
  `;

  let serviceCountQuery = isCorporateTag
    ? `
    SELECT COUNT(*) as total
    FROM service_events se FORCE INDEX (idx_service_events_location)
    LEFT JOIN enterprises e ON se.enterprise_id = e.id
    WHERE MBRContains(
        ST_GeomFromText('${envelopeWkt}', 4326, 'axis-order=long-lat'),
        se.location
      )
      AND ST_Distance_Sphere(
        se.location,
        ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
      ) <= ${radiusMeters}
      AND COALESCE(se.end_at, se.start_at) >= NOW()
      AND se.status IN ('approved', 'requested')
      ${serviceSearchCondition};
  `
    : null;

  if (isCorporateTag) {
    combinedQuery = `
      SELECT * FROM (
        (${platformSubquery})
        UNION ALL
        (${serviceSubquery})
      ) AS combined_events
      ORDER BY distance_km ASC
      LIMIT ${limitNum} OFFSET ${skip};
    `;
  } else {
    // Si se especificó una etiqueta temática distinta de Corporativo, solo aplica platform_events
    combinedQuery = `
      ${platformSubquery}
      ORDER BY distance_km ASC
      LIMIT ${limitNum} OFFSET ${skip};
    `;
  }

  const countPromises = [prisma.$queryRawUnsafe(platformCountQuery)];
  if (serviceCountQuery) {
    countPromises.push(prisma.$queryRawUnsafe(serviceCountQuery));
  }

  let rawEvents;
  let countResults;

  try {
    [rawEvents, ...countResults] = await Promise.all([
      prisma.$queryRawUnsafe(combinedQuery),
      ...countPromises,
    ]);
  } catch (error) {
    const isMissingSpatialIndex =
      error?.message?.includes("doesn't exist") ||
      error?.meta?.code === "1176" ||
      error?.code === "P2010";

    if (isMissingSpatialIndex) {
      console.warn(
        "[geoSpatialService] Índice espacial no encontrado o desactualizado (Code 1176/P2010). Aplicando auto-migración...",
      );
      try {
        const { applyPlatformEventsSpatialMigration } = await import(
          "../../scripts/migrate-spatial.js"
        );
        const { applyServiceEventsSpatialMigration } = await import(
          "../../scripts/migrate-service-events-spatial.js"
        );
        await applyPlatformEventsSpatialMigration();
        await applyServiceEventsSpatialMigration();

        // Reintentar consulta tras la migración automática
        const freshCountPromises = [prisma.$queryRawUnsafe(platformCountQuery)];
        if (serviceCountQuery) {
          freshCountPromises.push(prisma.$queryRawUnsafe(serviceCountQuery));
        }
        [rawEvents, ...countResults] = await Promise.all([
          prisma.$queryRawUnsafe(combinedQuery),
          ...freshCountPromises,
        ]);
      } catch (retryErr) {
        console.error(
          "[geoSpatialService] Error durante la auto-migración espacial:",
          retryErr,
        );
        throw retryErr;
      }
    } else {
      throw error;
    }
  }

  const platformTotal = Number(countResults[0]?.[0]?.total || 0);
  const serviceTotal = countResults[1]
    ? Number(countResults[1]?.[0]?.total || 0)
    : 0;
  const total = platformTotal + serviceTotal;

  // Batch resolve de etiquetas para platform_events
  const platformEventIds = rawEvents
    .filter((e) => e.event_type === "platform_event")
    .map((e) => e.id);

  const tagsByEventId = new Map();
  if (platformEventIds.length > 0) {
    const eventTags = await prisma.eventTag.findMany({
      where: { event_id: { in: platformEventIds } },
      include: { tag: true },
    });

    for (const et of eventTags) {
      if (!tagsByEventId.has(et.event_id)) {
        tagsByEventId.set(et.event_id, []);
      }
      tagsByEventId.get(et.event_id).push(et.tag);
    }
  }

  // Normalización homogénea de cada evento
  const corporateDefaultTag = [
    {
      id: 0,
      name: "Corporativo",
      description: "Evento corporativo de empresa",
      tag: {
        id: 0,
        name: "Corporativo",
        description: "Evento corporativo de empresa",
      },
    },
  ];

  const events = rawEvents.map((event) => {
    const isService = event.event_type === "service_event";
    const eventTags = isService
      ? corporateDefaultTag
      : tagsByEventId.get(event.id) || [];

    const companyObj = {
      id: event.company_id || event.enterprise_id,
      name: event.company_name || "Organización",
      logo: event.company_logo || null,
      website: event.company_website || event.url || null,
      is_enterprise: isService || Boolean(event.enterprise_id),
    };

    const enterpriseObj = event.enterprise_id
      ? {
          id: event.enterprise_id,
          name: event.enterprise_name || event.company_name,
          logo: event.enterprise_logo || event.company_logo,
          website: event.enterprise_website || event.company_website,
        }
      : null;

    return {
      id: event.id,
      name: event.name,
      title: event.name,
      unique_code: event.unique_code,
      description: event.description || "",
      image: event.image || null,
      url: event.url || null,
      ticket_url: event.ticket_url || null,
      start_date: event.start_date,
      end_date: event.end_date,
      latitude: event.latitude != null ? Number(event.latitude) : null,
      longitude: event.longitude != null ? Number(event.longitude) : null,
      location_name: event.location_name,
      address: event.address || event.location_name,
      company_id: companyObj.id,
      company_name: companyObj.name,
      company_logo: companyObj.logo,
      company: companyObj,
      enterprise_id: event.enterprise_id || null,
      enterprise: enterpriseObj,
      tags: eventTags,
      distance_km: Number(event.distance_km),
      event_type: event.event_type,
      is_corporate: isService || Boolean(event.enterprise_id),
    };
  });

  return {
    events,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Alias retrocompatible para el controlador existente.
 */
export async function findNearbyPlatformEvents(params) {
  return findNearbyEvents(params);
}
