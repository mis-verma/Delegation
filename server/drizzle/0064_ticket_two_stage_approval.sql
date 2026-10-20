ALTER TABLE `Ticket` ADD `approvalStage` enum('HOD','PC');--> statement-breakpoint
ALTER TABLE `Ticket` ADD `hodApprovedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `Ticket` ADD `hodApprovedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_hodApprovedBy_User_id_fk` FOREIGN KEY (`hodApprovedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE `Ticket` SET `approvalStage` = 'PC' WHERE `status` = 'PENDING_APPROVAL';
