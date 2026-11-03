import prisma from "../app/lib/prisma.js";

/**
 * Script de migración idempotente para crear la tabla `service_event_participants`
 * permitiendo que cualquier usuario se una a eventos corporativos (service_events).
 */
export async function applyServiceEventParticipantsMigration() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`service_event_participants\` (
        \`user_id\` VARCHAR(36) NOT NULL,
        \`service_event_id\` VARCHAR(36) NOT NULL,
        \`joined_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`user_id\`, \`service_event_id\`),
        INDEX \`idx_sep_service_event\` (\`service_event_id\`),
        INDEX \`idx_sep_user\` (\`user_id\`),
        CONSTRAINT \`fk_sep_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_sep_service_event\` FOREIGN KEY (\`service_event_id\`) REFERENCES \`service_events\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Tabla `service_event_participants` verificada o creada correctamente.");
  } catch (error) {
    console.error("Error al aplicar la migración de service_event_participants:", error);
    throw error;
  }
}

// Ejecutar directamente si se invoca por CLI
if (process.argv[1]?.endsWith("migrate-service-event-participants.js")) {
  applyServiceEventParticipantsMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
