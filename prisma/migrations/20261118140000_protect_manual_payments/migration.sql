-- DropForeignKey
ALTER TABLE `ManualPayment` DROP FOREIGN KEY `ManualPayment_site_user_id_fkey`;

-- AddForeignKey
ALTER TABLE `ManualPayment` ADD CONSTRAINT `ManualPayment_site_user_id_fkey` FOREIGN KEY (`site_user_id`) REFERENCES `SiteUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

