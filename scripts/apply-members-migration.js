import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function run() {
  console.log("Applying Enterprise Members and Invitations migration to MySQL...");

  // 1. Create enterprise_members table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS enterprise_members (
      id VARCHAR(36) NOT NULL,
      enterprise_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      role ENUM('ADMIN', 'MANAGER', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
      status ENUM('ACTIVE', 'INVITED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
      department VARCHAR(100) NULL,
      employee_code VARCHAR(50) NULL,
      joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE INDEX enterprise_members_enterprise_id_user_id_key (enterprise_id, user_id),
      INDEX enterprise_members_enterprise_id_idx (enterprise_id),
      INDEX enterprise_members_user_id_idx (user_id),
      INDEX enterprise_members_role_idx (role),
      CONSTRAINT enterprise_members_enterprise_id_fkey FOREIGN KEY (enterprise_id) REFERENCES enterprises (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT enterprise_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  console.log("Table enterprise_members verified/created.");

  // 2. Create enterprise_invitations table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS enterprise_invitations (
      id VARCHAR(36) NOT NULL,
      enterprise_id VARCHAR(36) NOT NULL,
      email VARCHAR(255) NOT NULL,
      role ENUM('ADMIN', 'MANAGER', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
      department VARCHAR(100) NULL,
      employee_code VARCHAR(50) NULL,
      token VARCHAR(100) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      accepted_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE INDEX enterprise_invitations_token_key (token),
      INDEX enterprise_invitations_enterprise_id_idx (enterprise_id),
      INDEX enterprise_invitations_token_idx (token),
      CONSTRAINT enterprise_invitations_enterprise_id_fkey FOREIGN KEY (enterprise_id) REFERENCES enterprises (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  console.log("Table enterprise_invitations verified/created.");

  console.log("Migration executed successfully!");
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
