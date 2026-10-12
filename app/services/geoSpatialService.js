import prisma from "../lib/prisma.js";

/**
 * Busca eventos de plataforma cercanos usando optimización R-Tree nativa de MySQL.
 * Usa un enfoque de dos fases:
 * 1. MBRWithin con polígono envolvente para activar el índice espacial R-Tree (O(log N))
 * 2. ST_Distance_Sphere para filtrado preciso por radio circular
 *
 * @param {Object} params
 * @param {Object} params.point - GeoPoint instance
 * @param {number} params.radiusKm - Radio de búsqueda en km
 * @param {string} [params.tag] - Etiqueta opcional para filtrar
 * @param {number} params.page - Número de página (1-based)
 * @param {number} params.limit - Límite de resultados por página
 * @returns {Promise<{events: Array, total: number, totalPages: number}>}
 */
export async function findNearbyPlatformEvents({ point, radiusKm, tag, page, limit }) {
  const radiusMeters = radiusKm * 1000;
  const envelopeWkt = point.toEnvelopePolygonWKT(radiusKm);
  const pointWkt = point.toWKT();
  const skip = (page - 1) * limit;

  const tagCondition = tag
    ? `AND EXISTS (
        SELECT 1 FROM event_tags et
        JOIN tags t ON et.tag_id = t.id
        WHERE et.event_id = pe.id AND t.name = '${tag.replace(/'/g, "''")}'
      )`
    : "";

  const query = `
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
      c.name AS company_name,
      c.logo AS company_logo,
      ROUND(
        ST_Distance_Sphere(
          pe.location,
          ST_SRID(POINT(${point.lng}, ${point.lat}), 4326)
        ) / 1000, 2
      ) AS distance_km
    FROM platform_events pe
    LEFT JOIN companies c ON pe.company_id = c.id
    WHERE pe.latitude IS NOT NULL
      AND pe.longitude IS NOT NULL
      AND MBRWithin(pe.location, ST_GeomFromText('${envelopeWkt}', 4326))
      AND ST_Distance_Sphere(
        pe.location,
        ST_SRID(POINT(${point.lng}, ${point.lat}), 4326)
      ) <= ${radiusMeters}
      AND pe.end_date >= NOW()
      ${tagCondition}
    ORDER BY distance_km ASC
    LIMIT ${limit} OFFSET ${skip};
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM platform_events pe
    WHERE pe.latitude IS NOT NULL
      AND pe.longitude IS NOT NULL
      AND MBRWithin(pe.location, ST_GeomFromText('${envelopeWkt}', 4326))
      AND ST_Distance_Sphere(
        pe.location,
        ST_SRID(POINT(${point.lng}, ${point.lat}), 4326)
      ) <= ${radiusMeters}
      AND pe.end_date >= NOW()
      ${tagCondition};
  `;

  const [events, countResult] = await Promise.all([
    prisma.$queryRawUnsafe(query),
    prisma.$queryRawUnsafe(countQuery),
  ]);

  const total = Number(countResult[0]?.total || 0);

  const eventsWithTags = await Promise.all(
    events.map(async (event) => {
      const tags = await prisma.eventTag.findMany({
        where: { event_id: event.id },
        include: { tag: true },
      });
      return {
        ...event,
        tags: tags.map((et) => et.tag),
      };
    })
  );

  return {
    events: eventsWithTags,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}