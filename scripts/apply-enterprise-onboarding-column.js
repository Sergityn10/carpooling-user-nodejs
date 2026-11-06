import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function run() {
  console.log("Applying onboarding_ended column to enterprises table...");
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`enterprises\` ADD COLUMN \`onboarding_ended\` BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log("Column onboarding_ended successfully added to enterprises table.");
  } catch (err) {
    if (err.message.includes("Duplicate column name")) {
      console.log("Column onboarding_ended already exists in enterprises table.");
    } else {
      console.error("Error adding column onboarding_ended:", err.message);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

run();
