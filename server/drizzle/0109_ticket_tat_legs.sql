ALTER TABLE `Ticket` ADD `reopenedAssigneeId` varchar(191);
--> statement-breakpoint
ALTER TABLE `Ticket` ADD `sameAssigneeReopens` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_reopenedAssigneeId_User_id_fk` FOREIGN KEY (`reopenedAssigneeId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE `Ticket` SET `reopenedAssigneeId` = `assigneeId`, `sameAssigneeReopens` = `reopenCount` WHERE `reopenCount` > 0 AND `assigneeId` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `Ticket_assignmentApprovedAt_idx` ON `Ticket` (`assignmentApprovedAt`);
