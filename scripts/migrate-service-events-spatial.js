#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function getColumnInfo(tableName, columnName) {
  const result = await prisma.$queryRaw`
    SELECT COLUMN_NAME, EXTRA, GENERATION_EXPRESSION
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
  `;
  return result[0] || null;
}

async function indexExists(tableName, indexName) {
  const result = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND INDEX_NAME = ${indexName}
  `;
  return Number(result[0].count) > 0;
}

export async function applyServiceEventsSpatialMigration() {
  console.log("Iniciando migración espacial optimizada para service_events...");

  try {
    const table = "service_events";
    const colInfo = await getColumnInfo(table, "location");

    const isGeneratedStored =
      colInfo &&
      colInfo.EXTRA &&
      colInfo.EXTRA.toUpperCase().includes("STORED GENERATED");

    const hasCorrectExpression =
      isGeneratedStored &&
      colInfo.GENERATION_EXPRESSION &&
      colInfo.GENERATION_EXPRESSION.includes("longitude") &&
      colInfo.GENERATION_EXPRESSION.indexOf("longitude") <
        colInfo.GENERATION_EXPRESSION.indexOf("latitude");

    if (!colInfo) {
      console.log("  Creando columna calculada persistida (STORED) 'location' en service_events...");
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`location\` POINT
        GENERATED ALWAYS AS (
          ST_SRID(POINT(COALESCE(\`longitude\`, 0), COALESCE(\`latitude\`, 0)), 4326)
        ) STORED NOT NULL SRID 4326;
      `);
      console.log("  Columna 'location' creada correctamente en service_events.");
    } else if (!hasCorrectExpression) {
      console.log(
        "  La columna 'location' en service_events no es STORED GENERATED o tiene los ejes invertidos. Recreando..."
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` DROP COLUMN \`location\`;`
      );
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`location\` POINT
        GENERATED ALWAYS AS (
          ST_SRID(POINT(COALESCE(\`longitude\`, 0), COALESCE(\`latitude\`, 0)), 4326)
        ) STORED NOT NULL SRID 4326;
      `);
      console.log("  Columna 'location' recreada con la definición generada STORED correcta.");
    } else {
      console.log(
        "  Columna calculada 'location' ya existe en service_events y tiene la definición correcta."
      );
    }

    // Comprobar índice espacial
    if (!(await indexExists(table, "idx_service_events_location"))) {
      console.log("  Creando índice espacial R-Tree 'idx_service_events_location'...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD SPATIAL INDEX \`idx_service_events_location\` (\`location\`);`
      );
      console.log("  Índice espacial R-Tree creado correctamente en service_events.");
    } else {
      console.log("  Índice espacial R-Tree ya existe en service_events, omitiendo...");
    }

    // Comprobar índice auxiliar en end_at
    if (!(await indexExists(table, "idx_service_events_end_at"))) {
      console.log("  Creando índice en 'end_at'...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD INDEX \`idx_service_events_end_at\` (\`end_at\`);`
      );
      console.log("  Índice en 'end_at' creado correctamente en service_events.");
    } else {
      console.log("  Índice en 'end_at' ya existe en service_events, omitiendo...");
    }

    console.log("\nMigración espacial completada con éxito para service_events.");
  } catch (error) {
    console.error("\nError durante la migración de service_events:", error);
    throw error;
  }
}

if (process.argv[1]?.endsWith("migrate-service-events-spatial.js")) {
  applyServiceEventsSpatialMigration()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
