ALTER TABLE `Ticket` ADD `claimOpenedAt` datetime;
--> statement-breakpoint
ALTER TABLE `Ticket` ADD `claimedAt` datetime;
--> statement-breakpoint
CREATE INDEX `Ticket_departmentId_claimOpenedAt_idx` ON `Ticket` (`departmentId`,`claimOpenedAt`);
