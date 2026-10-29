CREATE TABLE `PersonLeave` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`reason` varchar(191),
	`createdBy` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `PersonLeave_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
ALTER TABLE `PersonLeave` ADD CONSTRAINT `PersonLeave_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `PersonLeave_userId_idx` ON `PersonLeave` (`userId`);--> statement-breakpoint
CREATE INDEX `PersonLeave_dates_idx` ON `PersonLeave` (`startDate`,`endDate`);
