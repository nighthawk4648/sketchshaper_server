-- AlterTable
ALTER TABLE `ContactMessage` ADD COLUMN `attachment_file` VARCHAR(255) NULL,
    ADD COLUMN `attachment_mime` VARCHAR(100) NULL,
    ADD COLUMN `attachment_name` VARCHAR(255) NULL,
    ADD COLUMN `attachment_size` INTEGER NULL,
    ADD COLUMN `custom_scope` VARCHAR(255) NULL,
    ADD COLUMN `phone` VARCHAR(30) NULL,
    ADD COLUMN `reference_url` VARCHAR(2048) NULL,
    ADD COLUMN `service_scope` VARCHAR(150) NULL,
    ADD COLUMN `service_type` VARCHAR(30) NULL;

-- CreateIndex
CREATE INDEX `ContactMessage_service_type_idx` ON `ContactMessage`(`service_type`);
