CREATE TABLE `CategorySubcategoryTag` (
	`id` varchar(191) NOT NULL,
	`subcategoryId` varchar(191) NOT NULL,
	`tagId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `CategorySubcategoryTag_id` PRIMARY KEY(`id`),
	CONSTRAINT `CategorySubcategoryTag_subcategoryId_tagId_key` UNIQUE(`subcategoryId`,`tagId`)
);
--> statement-breakpoint
CREATE INDEX `CategorySubcategoryTag_tagId_idx` ON `CategorySubcategoryTag` (`tagId`);
--> statement-breakpoint
ALTER TABLE `CategorySubcategoryTag` ADD CONSTRAINT `CategorySubcategoryTag_subcategoryId_CategorySubcategory_id_fk` FOREIGN KEY (`subcategoryId`) REFERENCES `CategorySubcategory`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `CategorySubcategoryTag` ADD CONSTRAINT `CategorySubcategoryTag_tagId_Tag_id_fk` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE cascade ON UPDATE no action;
