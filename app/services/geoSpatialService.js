import prisma from "../lib/prisma.js";

/**
 * Busca eventos de plataforma cercanos usando optimización R-Tree nativa de MySQL.
 * Usa un enfoque de dos fases:
 * 1. MBRContains con polígono envolvente forzando el índice espacial R-Tree (O(log N))
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
          ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
        ) / 1000, 2
      ) AS distance_km
    FROM platform_events pe FORCE INDEX (idx_platform_events_location)
    LEFT JOIN companies c ON pe.company_id = c.id
    WHERE MBRContains(
        ST_GeomFromText('${envelopeWkt}', 4326, 'axis-order=long-lat'),
        pe.location
      )
      AND ST_Distance_Sphere(
        pe.location,
        ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
      ) <= ${radiusMeters}
      AND pe.end_date >= NOW()
      ${tagCondition}
    ORDER BY distance_km ASC
    LIMIT ${limit} OFFSET ${skip};
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM platform_events pe FORCE INDEX (idx_platform_events_location)
    WHERE MBRContains(
        ST_GeomFromText('${envelopeWkt}', 4326, 'axis-order=long-lat'),
        pe.location
      )
      AND ST_Distance_Sphere(
        pe.location,
        ST_GeomFromText('${pointWkt}', 4326, 'axis-order=long-lat')
      ) <= ${radiusMeters}
      AND pe.end_date >= NOW()
      ${tagCondition};
  `;

  const [events, countResult] = await Promise.all([
    prisma.$queryRawUnsafe(query),
    prisma.$queryRawUnsafe(countQuery),
  ]);

  const total = Number(countResult[0]?.total || 0);

  // Optimización Batch: resolver todos los tags en una sola consulta en lugar de N+1 consultas individuales
  const eventIds = events.map((event) => event.id);
  const tagsByEventId = new Map();

  if (eventIds.length > 0) {
    const eventTags = await prisma.eventTag.findMany({
      where: { event_id: { in: eventIds } },
      include: { tag: true },
    });

    for (const et of eventTags) {
      if (!tagsByEventId.has(et.event_id)) {
        tagsByEventId.set(et.event_id, []);
      }
      tagsByEventId.get(et.event_id).push(et.tag);
    }
  }

  const eventsWithTags = events.map((event) => ({
    ...event,
    tags: tagsByEventId.get(event.id) || [],
  }));

  return {
    events: eventsWithTags,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
