CREATE TABLE `ExtraWorkingDay` (
	`id` varchar(191) NOT NULL,
	`date` varchar(10) NOT NULL,
	`reason` varchar(191) NOT NULL,
	`scope` enum('ALL','DEPARTMENT','STORE','PEOPLE') NOT NULL DEFAULT 'ALL',
	`targetIds` json NOT NULL,
	`createdBy` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `ExtraWorkingDay_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ExtraWorkingDay_date_idx` ON `ExtraWorkingDay` (`date`);