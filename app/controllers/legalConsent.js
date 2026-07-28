import prisma from "../lib/prisma.js";

async function getAllConsents(req, res) {
  try {
    const { documentType, userId, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));

    const where = {};
    if (documentType) where.documentType = documentType;
    if (userId) where.userId = userId;

    const [consents, total] = await Promise.all([
      prisma.legalConsent.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, name: true, surname: true },
          },
        },
        orderBy: { acceptedAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.legalConsent.count({ where }),
    ]);

    return res.status(200).send({
      status: "Success",
      data: consents,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("[legalConsent] getAllConsents error:", error);
    return res.status(500).send({
      status: "Error",
      message: "No se pudieron obtener los consentimientos.",
    });
  }
}

async function getConsentsByUser(req, res) {
  try {
    const { userId } = req.params;

    const consents = await prisma.legalConsent.findMany({
      where: { userId },
      orderBy: { acceptedAt: "desc" },
    });

    const summary = {
      privacy_policy: consents.find((c) => c.documentType === "PRIVACY_POLICY") || null,
      terms_of_service: consents.find((c) => c.documentType === "TERMS_OF_SERVICE") || null,
      marketing: consents.find((c) => c.documentType === "MARKETING") || null,
    };

    return res.status(200).send({
      status: "Success",
      data: { allConsents: consents, latestByType: summary },
    });
  } catch (error) {
    console.error("[legalConsent] getConsentsByUser error:", error);
    return res.status(500).send({
      status: "Error",
      message: "No se pudieron obtener los consentimientos del usuario.",
    });
  }
}

async function getConsentSummary(req, res) {
  try {
    const totalUsers = await prisma.user.count();

    const privacyAccepted = await prisma.legalConsent.findMany({
      where: { documentType: "PRIVACY_POLICY" },
      select: { userId: true },
      distinct: ["userId"],
    });
    const termsAccepted = await prisma.legalConsent.findMany({
      where: { documentType: "TERMS_OF_SERVICE" },
      select: { userId: true },
      distinct: ["userId"],
    });
    const marketingAccepted = await prisma.legalConsent.findMany({
      where: { documentType: "MARKETING" },
      select: { userId: true },
      distinct: ["userId"],
    });

    const privacyCount = privacyAccepted.length;
    const termsCount = termsAccepted.length;
    const marketingCount = marketingAccepted.length;

    return res.status(200).send({
      status: "Success",
      data: {
        totalUsers,
        privacy_policy: {
          accepted: privacyCount,
          notAccepted: totalUsers - privacyCount,
        },
        terms_of_service: {
          accepted: termsCount,
          notAccepted: totalUsers - termsCount,
        },
        marketing: {
          accepted: marketingCount,
          notAccepted: totalUsers - marketingCount,
        },
      },
    });
  } catch (error) {
    console.error("[legalConsent] getConsentSummary error:", error);
    return res.status(500).send({
      status: "Error",
      message: "No se pudo generar el resumen de consentimientos.",
    });
  }
}

async function getUsersWithoutConsent(req, res) {
  try {
    const { documentType } = req.params;
    const validTypes = ["PRIVACY_POLICY", "TERMS_OF_SERVICE", "MARKETING"];
    if (!validTypes.includes(documentType)) {
      return res.status(400).send({
        status: "Error",
        message: `documentType debe ser uno de: ${validTypes.join(", ")}`,
      });
    }

    const usersWithConsent = await prisma.legalConsent.findMany({
      where: { documentType },
      select: { userId: true },
      distinct: ["userId"],
    });
    const userIdsWithConsent = usersWithConsent.map((c) => c.userId);

    const usersWithout = await prisma.user.findMany({
      where: {
        id: { notIn: userIdsWithConsent.length > 0 ? userIdsWithConsent : undefined },
      },
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    return res.status(200).send({
      status: "Success",
      documentType,
      count: usersWithout.length,
      data: usersWithout,
    });
  } catch (error) {
    console.error("[legalConsent] getUsersWithoutConsent error:", error);
    return res.status(500).send({
      status: "Error",
      message: "No se pudo obtener el listado de usuarios sin consentimiento.",
    });
  }
}

async function getMyConsents(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).send({
        status: "Error",
        message: "No se ha podido identificar tu sesión.",
      });
    }

    const consents = await prisma.legalConsent.findMany({
      where: { userId: String(user.id) },
      orderBy: { acceptedAt: "desc" },
    });

    const summary = {
      privacy_policy: consents.find((c) => c.documentType === "PRIVACY_POLICY") || null,
      terms_of_service: consents.find((c) => c.documentType === "TERMS_OF_SERVICE") || null,
      marketing: consents.find((c) => c.documentType === "MARKETING") || null,
    };

    return res.status(200).send({
      status: "Success",
      data: { allConsents: consents, latestByType: summary },
    });
  } catch (error) {
    console.error("[legalConsent] getMyConsents error:", error);
    return res.status(500).send({
      status: "Error",
      message: "No se pudieron obtener tus consentimientos.",
    });
  }
}

export const methods = {
  getAllConsents,
  getConsentsByUser,
  getConsentSummary,
  getUsersWithoutConsent,
  getMyConsents,
};
