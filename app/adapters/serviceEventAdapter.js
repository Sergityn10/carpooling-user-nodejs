/**
 * Adaptador polimórfico para normalizar eventos corporativos (service_events)
 * y eventos de plataforma (platform_events) bajo un contrato JSON unificado
 * compatible con los componentes del frontend (EventCard, EventDetail, SearchTrayectos).
 */

export function mapServiceEventToStandardEvent(se, distanceKm = null) {
  if (!se) return null;

  const resolvedDistance =
    distanceKm != null
      ? Number(distanceKm)
      : se.distance_km != null
      ? Number(se.distance_km)
      : undefined;

  const enterpriseName = se.enterprise?.name || "Organización";
  const enterpriseLogo = se.enterprise?.logo || null;
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
          logo: se.enterprise.logo,
          website: se.enterprise.website,
        }
      : {
          id: se.enterprise_id,
          name: enterpriseName,
          logo: enterpriseLogo,
          website: enterpriseWebsite,
        },
    tags,
    chat_id: se.chat_id || null,
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
  const companyLogo =
    pe.company?.logo || pe.company_logo || pe.enterprise?.logo || null;
  const companyWebsite =
    pe.company?.website || pe.url || pe.enterprise?.website || null;

  const locationName =
    pe.location_name || pe.address || companyName || "Recinto Principal";

  return {
    ...pe,
    name: pe.name,
    title: pe.name,
    latitude: pe.latitude != null ? Number(pe.latitude) : null,
    longitude: pe.longitude != null ? Number(pe.longitude) : null,
    location_name: locationName,
    company_id: pe.company_id || pe.enterprise_id,
    company_name: companyName,
    company_logo: companyLogo,
    company: pe.company || {
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
