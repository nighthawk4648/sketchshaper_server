-- AlterTable
ALTER TABLE `SiteUser` ADD COLUMN `google_id` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `SiteUser_google_id_key` ON `SiteUser`(`google_id`);

