-- CreateTable
CREATE TABLE `ManualPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_user_id` INTEGER NOT NULL,
    `amount_minor` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `paid_on` DATE NOT NULL,
    `note` VARCHAR(255) NULL,
    `added_by` VARCHAR(254) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ManualPayment_site_user_id_idx`(`site_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ManualPayment` ADD CONSTRAINT `ManualPayment_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

