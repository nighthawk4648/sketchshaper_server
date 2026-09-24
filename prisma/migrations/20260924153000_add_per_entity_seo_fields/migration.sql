-- AlterTable
ALTER TABLE `Asset` ADD COLUMN `keywords` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `Blog` ADD COLUMN `keywords` LONGTEXT NULL,
    ADD COLUMN `meta_description` LONGTEXT NULL,
    ADD COLUMN `meta_title` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Category` ADD COLUMN `keywords` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `Page` ADD COLUMN `keywords` LONGTEXT NULL,
    ADD COLUMN `meta_description` LONGTEXT NULL,
    ADD COLUMN `meta_title` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SubCategory` ADD COLUMN `keywords` LONGTEXT NULL;

