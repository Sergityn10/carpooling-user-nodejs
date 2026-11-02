import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function run() {
  console.log("Applying Enterprise migration to MySQL database...");

  // 1. Ensure role 'enterprise' exists
  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO \`roles\` (\`id\`, \`name\`) VALUES (3, 'enterprise');
  `);
  console.log("Role 'enterprise' verified.");

  // 2. Add columns to enterprises
  const enterpriseCols = [
    { name: "description", type: "TEXT NULL" },
    { name: "location", type: "VARCHAR(255) NULL" },
    { name: "logo", type: "MEDIUMTEXT NULL" },
    { name: "contact_person", type: "VARCHAR(255) NULL" },
    { name: "sector", type: "VARCHAR(100) NULL" },
    { name: "employee_count", type: "INT NULL" },
    { name: "is_active", type: "BOOLEAN NOT NULL DEFAULT TRUE" },
    { name: "is_deleted", type: "BOOLEAN NOT NULL DEFAULT FALSE" },
    { name: "deleted_at", type: "DATETIME(3) NULL" },
    { name: "role_id", type: "INT NOT NULL DEFAULT 3" },
  ];

  for (const col of enterpriseCols) {
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`enterprises\` ADD COLUMN \`${col.name}\` ${col.type};
      `);
      console.log(`Added column ${col.name} to enterprises.`);
    } catch (err) {
      if (err.message.includes("Duplicate column name")) {
        console.log(`Column ${col.name} already exists in enterprises.`);
      } else {
        console.warn(`Warning on column ${col.name}:`, err.message);
      }
    }
  }

  // 3. Add FK and indexes to enterprises
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`enterprises\` ADD CONSTRAINT \`enterprises_role_id_fkey\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;
    `);
    console.log("Foreign key enterprises_role_id_fkey added.");
  } catch (err) {
    if (err.message.includes("Duplicate foreign key") || err.message.includes("already exists")) {
      console.log("Foreign key enterprises_role_id_fkey already exists.");
    } else {
      console.log("FK note:", err.message);
    }
  }

  const indexes = [
    "CREATE INDEX `enterprises_is_active_idx` ON `enterprises`(`is_active`);",
    "CREATE INDEX `enterprises_is_deleted_idx` ON `enterprises`(`is_deleted`);",
    "CREATE INDEX `enterprises_role_id_idx` ON `enterprises`(`role_id`);",
  ];

  for (const idx of indexes) {
    try {
      await prisma.$executeRawUnsafe(idx);
    } catch (err) {
      // index might already exist
    }
  }

  // 4. Modify platform_events
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`platform_events\` ADD COLUMN \`enterprise_id\` VARCHAR(36) NULL;
    `);
    console.log("Added enterprise_id to platform_events.");
  } catch (err) {
    if (err.message.includes("Duplicate column name")) {
      console.log("Column enterprise_id already exists in platform_events.");
    }
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`platform_events\` MODIFY COLUMN \`company_id\` VARCHAR(36) NULL;
    `);
    console.log("company_id is now nullable in platform_events.");
  } catch (err) {
    console.warn("Modify company_id note:", err.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`platform_events\` ADD CONSTRAINT \`platform_events_enterprise_id_fkey\` FOREIGN KEY (\`enterprise_id\`) REFERENCES \`enterprises\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    console.log("Foreign key platform_events_enterprise_id_fkey added.");
  } catch (err) {
    // already exists
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX \`platform_events_enterprise_id_idx\` ON \`platform_events\`(\`enterprise_id\`);
    `);
  } catch (err) {
    // already exists
  }

  console.log("Migration finished successfully!");
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
