ALTER TABLE `Settings` ADD `autoCloseDays` int DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE `Task` ADD `autoClosedAt` datetime;
--> statement-breakpoint
ALTER TABLE `Task` ADD `autoCloseFrom` datetime;
--> statement-breakpoint
UPDATE `Task` SET `autoCloseFrom` = UTC_TIMESTAMP() WHERE `status` = 'pending_approval' AND `deletedAt` IS NULL;
