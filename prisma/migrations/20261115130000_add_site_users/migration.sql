-- AlterTable
ALTER TABLE `Session` ADD COLUMN `site_user_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `SiteUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(254) NOT NULL,
    `password` VARCHAR(100) NULL,
    `name` VARCHAR(100) NULL,
    `email_verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SiteUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token_hash` CHAR(64) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `site_user_id` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailToken_token_hash_key`(`token_hash`),
    INDEX `EmailToken_site_user_id_type_idx`(`site_user_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Session_site_user_id_idx` ON `Session`(`site_user_id`);

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailToken` ADD CONSTRAINT `EmailToken_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

