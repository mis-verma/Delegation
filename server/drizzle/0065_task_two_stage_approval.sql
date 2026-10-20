ALTER TABLE `Task` ADD `approvalStage` enum('HOD','PC');--> statement-breakpoint
ALTER TABLE `Task` ADD `hodApprovedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `Task` ADD `hodApprovedAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD CONSTRAINT `Task_hodApprovedBy_User_id_fk` FOREIGN KEY (`hodApprovedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE `Task` SET `approvalStage` = 'PC' WHERE `status` = 'pending_approval';
