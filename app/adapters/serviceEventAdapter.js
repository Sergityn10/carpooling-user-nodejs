/**
 * Adaptador polimórfico para normalizar eventos corporativos (service_events)
 * y eventos de plataforma (platform_events) bajo un contrato JSON unificado
 * compatible con los componentes del frontend (EventCard, EventDetail, SearchTrayectos).
 */

function getSafeLogo(rawLogo) {
  if (!rawLogo || typeof rawLogo !== "string") return null;
  // Si es una URL o cadena base64 ligera (< 10KB), se conserva
  if (rawLogo.length <= 10000) {
    return rawLogo;
  }
  // Omitir cadenas base64 masivas en contratos de eventos para evitar bloat de decenas de MB
  return null;
}

export function mapServiceEventToStandardEvent(se, distanceKm = null) {
  if (!se) return null;

  const resolvedDistance =
    distanceKm != null
      ? Number(distanceKm)
      : se.distance_km != null
      ? Number(se.distance_km)
      : undefined;

  const enterpriseName = se.enterprise?.name || "Organización";
  const enterpriseLogo = getSafeLogo(se.enterprise?.logo);
  const enterpriseWebsite = se.enterprise?.website || null;

  const locationName =
    se.venue_name || se.address_line1 || se.city || "Sede Corporativa";

  const uniqueCode =
    se.unique_code || `ORG-${se.id.slice(0, 8).toUpperCase()}`;

  const tags = [
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

  return {
    id: se.id,
    name: se.title || se.name,
    title: se.title || se.name,
    unique_code: uniqueCode,
    description: se.description || "",
    image: se.image || null,
    url: enterpriseWebsite,
    ticket_url: null,
    start_date: se.start_at || se.start_date,
    end_date: se.end_at || se.end_date || se.start_at || se.start_date,
    latitude: se.latitude != null ? Number(se.latitude) : null,
    longitude: se.longitude != null ? Number(se.longitude) : null,
    attendees_estimate:
      se.attendees_estimate != null ? Number(se.attendees_estimate) : null,
    max_attendees:
      se.attendees_estimate != null ? Number(se.attendees_estimate) : null,
    location_name: locationName,
    address: se.address_line1 || locationName,
    venue_name: se.venue_name || null,
    city: se.city || "",
    company_id: se.enterprise_id,
    company_name: enterpriseName,
    company_logo: enterpriseLogo,
    company: {
      id: se.enterprise?.id || se.enterprise_id,
      name: enterpriseName,
      logo: enterpriseLogo,
      website: enterpriseWebsite,
      is_enterprise: true,
    },
    enterprise_id: se.enterprise_id,
    enterprise: se.enterprise
      ? {
          id: se.enterprise.id,
          name: se.enterprise.name,
          logo: enterpriseLogo,
          website: enterpriseWebsite,
        }
      : {
          id: se.enterprise_id,
          name: enterpriseName,
          logo: enterpriseLogo,
          website: enterpriseWebsite,
        },
    tags,
    chat_id: se.chat_id || null,
    attendees_estimate: se.attendees_estimate ?? null,
    max_attendees: se.attendees_estimate ?? null,
    ...(resolvedDistance !== undefined ? { distance_km: resolvedDistance } : {}),
    event_type: "service_event",
    is_corporate: true,
    status: se.status || "requested",
    created_at: se.created_at,
    updated_at: se.updated_at,
  };
}

export function normalizePlatformEvent(pe, distanceKm = null) {
  if (!pe) return null;

  const resolvedDistance =
    distanceKm != null
      ? Number(distanceKm)
      : pe.distance_km != null
      ? Number(pe.distance_km)
      : undefined;

  const companyName =
    pe.company?.name ||
    pe.company_name ||
    pe.enterprise?.name ||
    "Organizador";
  const companyLogo = getSafeLogo(
    pe.company?.logo || pe.company_logo || pe.enterprise?.logo,
  );
  const companyWebsite =
    pe.company?.website || pe.url || pe.enterprise?.website || null;

  const locationName =
    pe.location_name || pe.address || companyName || "Recinto Principal";

  const safePe = { ...pe };
  if (safePe.enterprise && safePe.enterprise.logo) {
    safePe.enterprise = {
      ...safePe.enterprise,
      logo: getSafeLogo(safePe.enterprise.logo),
    };
  }
  if (safePe.company && safePe.company.logo) {
    safePe.company = {
      ...safePe.company,
      logo: getSafeLogo(safePe.company.logo),
    };
  }

  return {
    ...safePe,
    name: pe.name,
    title: pe.name,
    latitude: pe.latitude != null ? Number(pe.latitude) : null,
    longitude: pe.longitude != null ? Number(pe.longitude) : null,
    attendees_estimate: null,
    max_attendees: null,
    location_name: locationName,
    company_id: pe.company_id || pe.enterprise_id,
    company_name: companyName,
    company_logo: companyLogo,
    company: safePe.company || {
      id: pe.company_id || pe.enterprise_id,
      name: companyName,
      logo: companyLogo,
      website: companyWebsite,
      is_enterprise: Boolean(pe.enterprise_id),
    },
    ...(resolvedDistance !== undefined ? { distance_km: resolvedDistance } : {}),
    event_type: "platform_event",
    is_corporate: Boolean(pe.enterprise_id),
  };
}
