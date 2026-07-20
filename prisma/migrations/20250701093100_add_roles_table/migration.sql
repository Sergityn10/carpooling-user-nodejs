-- CreateTable
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `roles_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert default roles before adding FK
INSERT IGNORE INTO `roles` (`id`, `name`) VALUES (1, 'user'), (2, 'admin');

-- Add role_id column to users
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `role_id` INTEGER NOT NULL DEFAULT 1;

-- Ensure existing users have valid role_id
UPDATE `users` SET `role_id` = 1 WHERE `role_id` NOT IN (SELECT `id` FROM `roles`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS `users_role_id_idx` ON `users`(`role_id`);
