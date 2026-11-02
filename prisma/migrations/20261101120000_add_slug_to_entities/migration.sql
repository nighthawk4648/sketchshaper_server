-- AlterTable
ALTER TABLE `Category` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Category_slug_key` ON `Category`(`slug`);

-- AlterTable
ALTER TABLE `SubCategory` ADD COLUMN `slug` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Asset` ADD COLUMN `slug` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Blog` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Blog_slug_key` ON `Blog`(`slug`);

