-- CreateTable
CREATE TABLE `Session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token_hash` CHAR(64) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `admin_id` INTEGER NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,

    UNIQUE INDEX `Session_token_hash_key`(`token_hash`),
    INDEX `Session_admin_id_idx`(`admin_id`),
    INDEX `Session_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

