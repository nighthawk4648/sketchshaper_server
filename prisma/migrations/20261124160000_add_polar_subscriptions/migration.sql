-- CreateTable
CREATE TABLE `PolarSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_user_id` INTEGER NOT NULL,
    `polar_subscription_id` VARCHAR(64) NOT NULL,
    `polar_customer_id` VARCHAR(64) NOT NULL,
    `plan` VARCHAR(20) NOT NULL,
    `period` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `current_period_end` DATETIME(3) NULL,
    `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
    `last_event_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PolarSubscription_polar_subscription_id_key`(`polar_subscription_id`),
    INDEX `PolarSubscription_site_user_id_idx`(`site_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PolarSubscription` ADD CONSTRAINT `PolarSubscription_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
