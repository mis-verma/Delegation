CREATE TABLE `Draft` (
	`id` varchar(191) NOT NULL,
	`kind` enum('TICKET','CHECKLIST') NOT NULL,
	`userId` varchar(191) NOT NULL,
	`title` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	`createdAt` datetime NOT NULL,
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `Draft_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `Draft` ADD CONSTRAINT `Draft_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `Draft_userId_kind_updatedAt_idx` ON `Draft` (`userId`,`kind`,`updatedAt`);