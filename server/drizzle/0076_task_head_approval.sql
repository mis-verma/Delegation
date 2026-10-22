ALTER TABLE `Task` ADD `awaitingHeadApproval` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `Task` ADD `assignmentApprovedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `Task` ADD `assignmentApprovedAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD `declinedAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD `declinedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `Task` ADD `declineReason` text;--> statement-breakpoint
ALTER TABLE `Task` ADD `headReminderSentAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD `headEscalatedAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD CONSTRAINT `Task_assignmentApprovedBy_User_id_fk` FOREIGN KEY (`assignmentApprovedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Task` ADD CONSTRAINT `Task_declinedBy_User_id_fk` FOREIGN KEY (`declinedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
