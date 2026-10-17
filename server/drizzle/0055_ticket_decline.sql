ALTER TABLE `Ticket` ADD `declinedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `declinedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `Ticket` ADD `declineReason` text;--> statement-breakpoint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_declinedBy_User_id_fk` FOREIGN KEY (`declinedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;