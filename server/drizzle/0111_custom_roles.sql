CREATE TABLE `CustomRole` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`baseRole` enum('ADMIN','APPROVAL_MANAGER','SENIOR','MANAGER','AGENT','USER','PC','OWNER') NOT NULL,
	`description` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` datetime NOT NULL,
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `CustomRole_id` PRIMARY KEY(`id`),
	CONSTRAINT `CustomRole_name_key` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `User` ADD `customRoleId` varchar(191);
--> statement-breakpoint
ALTER TABLE `User` ADD CONSTRAINT `User_customRoleId_CustomRole_id_fk` FOREIGN KEY (`customRoleId`) REFERENCES `CustomRole`(`id`) ON DELETE set null ON UPDATE no action;
