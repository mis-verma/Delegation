CREATE TABLE `CategorySubcategory` (
	`id` varchar(191) NOT NULL,
	`categoryId` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`priority` enum('LOW','MEDIUM','HIGH','CRITICAL'),
	`tatHours` float,
	`assigneeId` varchar(191),
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` datetime NOT NULL,
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `CategorySubcategory_id` PRIMARY KEY(`id`),
	CONSTRAINT `CategorySubcategory_categoryId_name_key` UNIQUE(`categoryId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `CategorySubcategory_categoryId_sortOrder_idx` ON `CategorySubcategory` (`categoryId`,`sortOrder`);
--> statement-breakpoint
ALTER TABLE `CategorySubcategory` ADD CONSTRAINT `CategorySubcategory_categoryId_Category_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `CategorySubcategory` ADD CONSTRAINT `CategorySubcategory_assigneeId_User_id_fk` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `Ticket` ADD `subcategoryId` varchar(191);
--> statement-breakpoint
CREATE INDEX `Ticket_subcategoryId_idx` ON `Ticket` (`subcategoryId`);
--> statement-breakpoint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_subcategoryId_CategorySubcategory_id_fk` FOREIGN KEY (`subcategoryId`) REFERENCES `CategorySubcategory`(`id`) ON DELETE set null ON UPDATE no action;
