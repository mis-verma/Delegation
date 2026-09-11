CREATE TABLE `ChecklistDefinitionReviewer` (
	`id` varchar(191) NOT NULL,
	`definitionId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `ChecklistDefinitionReviewer_id` PRIMARY KEY(`id`),
	CONSTRAINT `ChecklistDefinitionReviewer_definitionId_userId_key` UNIQUE(`definitionId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `ChecklistInstanceReviewer` (
	`id` varchar(191) NOT NULL,
	`instanceId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `ChecklistInstanceReviewer_id` PRIMARY KEY(`id`),
	CONSTRAINT `ChecklistInstanceReviewer_instanceId_userId_key` UNIQUE(`instanceId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionReviewer` ADD CONSTRAINT `ChecklistDefinitionReviewer_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionReviewer` ADD CONSTRAINT `ChklistDefReviewer_definitionId_fk` FOREIGN KEY (`definitionId`) REFERENCES `ChecklistDefinition`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceReviewer` ADD CONSTRAINT `ChecklistInstanceReviewer_instanceId_ChecklistInstance_id_fk` FOREIGN KEY (`instanceId`) REFERENCES `ChecklistInstance`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceReviewer` ADD CONSTRAINT `ChecklistInstanceReviewer_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ChecklistInstanceReviewer_userId_idx` ON `ChecklistInstanceReviewer` (`userId`);