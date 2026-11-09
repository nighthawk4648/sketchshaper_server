-- CreateTable
CREATE TABLE `AssetRelation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_asset_id` INTEGER NOT NULL,
    `child_asset_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssetRelation_parent_asset_id_idx`(`parent_asset_id`),
    INDEX `AssetRelation_child_asset_id_idx`(`child_asset_id`),
    UNIQUE INDEX `AssetRelation_parent_asset_id_child_asset_id_key`(`parent_asset_id`, `child_asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlogAsset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blog_id` INTEGER NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BlogAsset_blog_id_idx`(`blog_id`),
    INDEX `BlogAsset_asset_id_idx`(`asset_id`),
    UNIQUE INDEX `BlogAsset_blog_id_asset_id_key`(`blog_id`, `asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AssetRelation` ADD CONSTRAINT `AssetRelation_parent_asset_id_fkey` FOREIGN KEY (`parent_asset_id`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRelation` ADD CONSTRAINT `AssetRelation_child_asset_id_fkey` FOREIGN KEY (`child_asset_id`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlogAsset` ADD CONSTRAINT `BlogAsset_blog_id_fkey` FOREIGN KEY (`blog_id`) REFERENCES `Blog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlogAsset` ADD CONSTRAINT `BlogAsset_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

