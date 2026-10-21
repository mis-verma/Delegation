ALTER TABLE `Ticket` ADD `awaitingHeadApproval` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `assignmentApprovedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `Ticket` ADD `assignmentApprovedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_assignmentApprovedBy_User_id_fk` FOREIGN KEY (`assignmentApprovedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;