CREATE TABLE `TicketTag` (
	`id` varchar(191) NOT NULL,
	`ticketId` varchar(191) NOT NULL,
	`tagId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `TicketTag_id` PRIMARY KEY(`id`),
	CONSTRAINT `TicketTag_ticketId_tagId_key` UNIQUE(`ticketId`,`tagId`)
);
--> statement-breakpoint
ALTER TABLE `TicketTag` ADD CONSTRAINT `TicketTag_ticketId_Ticket_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TicketTag` ADD CONSTRAINT `TicketTag_tagId_Tag_id_fk` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `TicketTag_tagId_idx` ON `TicketTag` (`tagId`);