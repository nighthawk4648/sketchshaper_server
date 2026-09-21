/*
  Warnings:

  - You are about to drop the `SketchShaperProCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SketchShaperProFile` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `SketchShaperProFile` DROP FOREIGN KEY `SketchShaperProFile_sketchshaper_pro_category_id_fkey`;

-- AlterTable
ALTER TABLE `Asset` ADD COLUMN `access_type` VARCHAR(191) NOT NULL DEFAULT 'free';

-- DropTable
DROP TABLE `SketchShaperProCategory`;

-- DropTable
DROP TABLE `SketchShaperProFile`;

-- CreateIndex
CREATE INDEX `Asset_access_type_idx` ON `Asset`(`access_type`);

-- RedefineIndex
CREATE INDEX `Asset_sub_category_id_idx` ON `Asset`(`sub_category_id`);
