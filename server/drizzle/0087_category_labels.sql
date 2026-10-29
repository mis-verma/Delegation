ALTER TABLE `Category` ADD `priority` enum('LOW','MEDIUM','HIGH','CRITICAL');--> statement-breakpoint
CREATE TABLE `CategoryTag` (
	`id` varchar(191) NOT NULL,
	`categoryId` varchar(191) NOT NULL,
	`tagId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `CategoryTag_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
ALTER TABLE `CategoryTag` ADD CONSTRAINT `CategoryTag_categoryId_Category_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CategoryTag` ADD CONSTRAINT `CategoryTag_tagId_Tag_id_fk` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX `CategoryTag_categoryId_tagId_key` ON `CategoryTag` (`categoryId`,`tagId`);--> statement-breakpoint
CREATE INDEX `CategoryTag_tagId_idx` ON `CategoryTag` (`tagId`);
