-- CreateTable
CREATE TABLE `ExtensionLogin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nonce_hash` CHAR(64) NOT NULL,
    `code` CHAR(6) NOT NULL,
    `site_user_id` INTEGER NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExtensionLogin_nonce_hash_key`(`nonce_hash`),
    UNIQUE INDEX `ExtensionLogin_code_key`(`code`),
    INDEX `ExtensionLogin_expires_at_idx`(`expires_at`),
    INDEX `ExtensionLogin_site_user_id_idx`(`site_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExtensionLogin` ADD CONSTRAINT `ExtensionLogin_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

