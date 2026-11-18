-- AlterTable
ALTER TABLE `SiteUser` ADD COLUMN `access` ENUM('normal', 'pro', 'blocked') NOT NULL DEFAULT 'normal',
    ADD COLUMN `access_note` VARCHAR(255) NULL,
    ADD COLUMN `access_until` DATETIME(3) NULL;
