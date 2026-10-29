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

async function applySpatialMigration() {
  console.log("Iniciando migración espacial optimizada para platform_events...");

  try {
    const table = "platform_events";
    const colInfo = await getColumnInfo(table, "location");

    // Comprobar si la columna ya es GENERATED ALWAYS AS (...) STORED con latitud primero
    const isGeneratedStored =
      colInfo &&
      colInfo.EXTRA &&
      colInfo.EXTRA.toUpperCase().includes("STORED GENERATED");

    const hasCorrectExpression =
      isGeneratedStored &&
      colInfo.GENERATION_EXPRESSION &&
      colInfo.GENERATION_EXPRESSION.includes("latitude") &&
      colInfo.GENERATION_EXPRESSION.indexOf("latitude") <
        colInfo.GENERATION_EXPRESSION.indexOf("longitude");

    if (!colInfo) {
      console.log("  Creando columna calculada persistida (STORED) 'location'...");
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`location\` POINT NOT NULL SRID 4326 
        GENERATED ALWAYS AS (
          ST_SRID(POINT(COALESCE(\`latitude\`, 0), COALESCE(\`longitude\`, 0)), 4326)
        ) STORED;
      `);
      console.log("  Columna 'location' creada correctamente.");
    } else if (!hasCorrectExpression) {
      console.log(
        "  La columna 'location' existente no es STORED GENERATED o tiene los ejes invertidos. Recreando..."
      );
      // Eliminar columna anterior (elimina automáticamente los índices dependientes)
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` DROP COLUMN \`location\`;`
      );
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`location\` POINT NOT NULL SRID 4326 
        GENERATED ALWAYS AS (
          ST_SRID(POINT(COALESCE(\`latitude\`, 0), COALESCE(\`longitude\`, 0)), 4326)
        ) STORED;
      `);
      console.log("  Columna 'location' recreada con la definición generada STORED correcta.");
    } else {
      console.log(
        "  Columna calculada 'location' ya existe y tiene la definición correcta."
      );
    }

    // Comprobar índice espacial
    if (!(await indexExists(table, "idx_platform_events_location"))) {
      console.log("  Creando índice espacial R-Tree 'idx_platform_events_location'...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD SPATIAL INDEX \`idx_platform_events_location\` (\`location\`);`
      );
      console.log("  Índice espacial R-Tree creado correctamente.");
    } else {
      console.log("  Índice espacial R-Tree ya existe, omitiendo...");
    }

    // Comprobar índice auxiliar en end_date
    if (!(await indexExists(table, "idx_platform_events_end_date"))) {
      console.log("  Creando índice en 'end_date'...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD INDEX \`idx_platform_events_end_date\` (\`end_date\`);`
      );
      console.log("  Índice en 'end_date' creado correctamente.");
    } else {
      console.log("  Índice en 'end_date' ya existe, omitiendo...");
    }

    console.log("\nMigración espacial completada con éxito para platform_events.");
  } catch (error) {
    console.error("\nError durante la migración:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applySpatialMigration();
