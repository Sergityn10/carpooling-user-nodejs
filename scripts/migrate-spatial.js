#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function columnExists(tableName, columnName) {
  const result = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = ${tableName}
    AND COLUMN_NAME = ${columnName}
  `;
  return Number(result[0].count) > 0;
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
  console.log("Iniciando migracion espacial para PlatformEvents...");

  try {
    const table = "platform_events";

    if (!(await columnExists(table, "location"))) {
      console.log("  Creando columna espacial 'location' (nullable inicialmente)...");
      // Paso 1: Crear columna POINT nullable
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `" + table + "` ADD COLUMN `location` POINT SRID 4326;"
      );
      // Paso 2: Actualizar solo filas con coordenadas válidas
      await prisma.$executeRawUnsafe(
        "UPDATE `" + table + "` SET `location` = ST_SRID(POINT(`longitude`, `latitude`), 4326) WHERE `latitude` IS NOT NULL AND `longitude` IS NOT NULL;"
      );
      // Paso 3: Establecer (0,0) para las que no tienen coordenadas
      await prisma.$executeRawUnsafe(
        "UPDATE `" + table + "` SET `location` = ST_SRID(POINT(0, 0), 4326) WHERE `location` IS NULL;"
      );
      // Paso 4: Cambiar a NOT NULL
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `" + table + "` MODIFY COLUMN `location` POINT NOT NULL SRID 4326;"
      );
      console.log("  Columna 'location' creada, poblada y convertida a NOT NULL correctamente");
    } else {
      console.log("  Columna 'location' ya existe, omitiendo...");
    }

    if (!(await indexExists(table, "idx_platform_events_location"))) {
      console.log("  Creando indice espacial R-Tree 'idx_platform_events_location'...");
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `" + table + "` ADD SPATIAL INDEX `idx_platform_events_location` (`location`);"
      );
      console.log("  Indice espacial R-Tree creado correctamente");
    } else {
      console.log("  Indice espacial R-Tree ya existe, omitiendo...");
    }

    if (!(await indexExists(table, "idx_platform_events_end_date"))) {
      console.log("  Creando indice compuesto en 'end_date'...");
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `" + table + "` ADD INDEX `idx_platform_events_end_date` (`end_date`);"
      );
      console.log("  Indice en end_date creado correctamente");
    } else {
      console.log("  Indice en end_date ya existe, omitiendo...");
    }

    console.log("\nMigracion espacial completada con exito");
  } catch (error) {
    console.error("\nError durante la migracion:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applySpatialMigration();