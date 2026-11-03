#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { applyServiceEventsSpatialMigration } from "./migrate-service-events-spatial.js";

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

export async function applyPlatformEventsSpatialMigration() {
  console.log("Iniciando migración espacial optimizada para platform_events...");

  try {
    const table = "platform_events";
    const colInfo = await getColumnInfo(table, "location");

    // Comprobar si la columna ya es GENERATED ALWAYS AS (...) STORED con longitud primero (x=lon, y=lat)
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
      console.log("  Creando columna calculada persistida (STORED) 'location' en platform_events...");
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`location\` POINT
        GENERATED ALWAYS AS (
          ST_SRID(POINT(COALESCE(\`longitude\`, 0), COALESCE(\`latitude\`, 0)), 4326)
        ) STORED NOT NULL SRID 4326;
      `);
      console.log("  Columna 'location' creada correctamente en platform_events.");
    } else if (!hasCorrectExpression) {
      console.log(
        "  La columna 'location' existente no es STORED GENERATED o tiene los ejes invertidos. Recreando..."
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
      console.log("  Columna 'location' recreada con la definición generada STORED correcta en platform_events.");
    } else {
      console.log(
        "  Columna calculada 'location' ya existe en platform_events y tiene la definición correcta."
      );
    }

    // Comprobar índice espacial
    if (!(await indexExists(table, "idx_platform_events_location"))) {
      console.log("  Creando índice espacial R-Tree 'idx_platform_events_location'...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD SPATIAL INDEX \`idx_platform_events_location\` (\`location\`);`
      );
      console.log("  Índice espacial R-Tree creado correctamente en platform_events.");
    } else {
      console.log("  Índice espacial R-Tree ya existe en platform_events, omitiendo...");
    }

    // Comprobar índice auxiliar en end_date
    if (!(await indexExists(table, "idx_platform_events_end_date"))) {
      console.log("  Creando índice en 'end_date'...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD INDEX \`idx_platform_events_end_date\` (\`end_date\`);`
      );
      console.log("  Índice en 'end_date' creado correctamente en platform_events.");
    } else {
      console.log("  Índice en 'end_date' ya existe en platform_events, omitiendo...");
    }

    console.log("\nMigración espacial completada con éxito para platform_events.");
  } catch (error) {
    console.error("\nError durante la migración de platform_events:", error);
    throw error;
  }
}

async function main() {
  await applyPlatformEventsSpatialMigration();
  await applyServiceEventsSpatialMigration();
  console.log("\nTodas las migraciones espaciales se completaron exitosamente.");
}

if (process.argv[1]?.endsWith("migrate-spatial.js")) {
  main()
    .catch((err) => {
      console.error("Fallo general en migraciones espaciales:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
