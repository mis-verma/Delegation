ALTER TABLE `Ticket` ADD `headClaimedBy` varchar(191);
--> statement-breakpoint
ALTER TABLE `Ticket` ADD `headClaimedAt` datetime;
--> statement-breakpoint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_headClaimedBy_User_id_fk` FOREIGN KEY (`headClaimedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE `Ticket` SET `headClaimedBy` = `assignmentApprovedBy`, `headClaimedAt` = `assignmentApprovedAt` WHERE `assignmentApprovedAt` IS NOT NULL AND `headClaimedAt` IS NULL;
--> statement-breakpoint
UPDATE `Ticket` SET `claimedAt` = `updatedAt` WHERE `claimOpenedAt` IS NOT NULL AND `claimedAt` IS NULL AND `assigneeId` IS NOT NULL;
