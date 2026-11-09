ALTER TABLE `Ticket` ADD `autoClosedAt` datetime;
--> statement-breakpoint
ALTER TABLE `Ticket` ADD `autoCloseFrom` datetime;
--> statement-breakpoint
UPDATE `Ticket` SET `autoCloseFrom` = UTC_TIMESTAMP() WHERE `status` = 'PENDING_APPROVAL' AND `deletedAt` IS NULL;
