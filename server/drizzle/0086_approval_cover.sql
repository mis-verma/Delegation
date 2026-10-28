CREATE TABLE `ApprovalCover` (
	`id` varchar(191) NOT NULL,
	`fromUserId` varchar(191) NOT NULL,
	`toUserId` varchar(191) NOT NULL,
	`startsAt` datetime NOT NULL,
	`endsAt` datetime NOT NULL,
	`note` varchar(191),
	`revokedAt` datetime,
	`createdBy` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `ApprovalCover_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
ALTER TABLE `ApprovalCover` ADD CONSTRAINT `ApprovalCover_fromUserId_User_id_fk` FOREIGN KEY (`fromUserId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ApprovalCover` ADD CONSTRAINT `ApprovalCover_toUserId_User_id_fk` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ApprovalCover_toUserId_endsAt_idx` ON `ApprovalCover` (`toUserId`,`endsAt`);--> statement-breakpoint
CREATE INDEX `ApprovalCover_fromUserId_idx` ON `ApprovalCover` (`fromUserId`);
