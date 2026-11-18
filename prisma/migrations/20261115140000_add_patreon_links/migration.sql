-- CreateTable
CREATE TABLE `PatreonLink` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_user_id` INTEGER NOT NULL,
    `patreon_id` VARCHAR(64) NOT NULL,
    `access_token_enc` TEXT NOT NULL,
    `refresh_token_enc` TEXT NOT NULL,
    `token_expires_at` DATETIME(3) NOT NULL,
    `membership_tier` VARCHAR(20) NULL,
    `is_active_patron` BOOLEAN NOT NULL DEFAULT false,
    `pledge_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `last_verified_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PatreonLink_site_user_id_key`(`site_user_id`),
    UNIQUE INDEX `PatreonLink_patreon_id_key`(`patreon_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PatreonLink` ADD CONSTRAINT `PatreonLink_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

