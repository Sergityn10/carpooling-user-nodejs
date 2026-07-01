import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // 1. Create roles
  const userRole = await prisma.role.upsert({
    where: { name: "user" },
    update: {},
    create: { id: 1, name: "user" },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: { id: 2, name: "admin" },
  });

  console.log("Roles created:", { userRole, adminRole });

  // 2. Create default admin user
  const adminEmail = process.env.ADMIN_EMAIL || "admin@youconnext.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin12345!";

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: "Administrator",
        auth_method: "password",
        role_id: adminRole.id,
        onboarding_ended: true,
      },
    });
    console.log("Default admin user created:", { id: admin.id, email: admin.email });
  } else {
    // Ensure existing admin has the admin role
    if (existingAdmin.role_id !== adminRole.id) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role_id: adminRole.id },
      });
      console.log("Existing admin user updated with admin role:", existingAdmin.email);
    } else {
      console.log("Admin user already exists:", existingAdmin.email);
    }
  }
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
