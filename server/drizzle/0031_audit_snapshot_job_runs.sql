CREATE TABLE `JobRun` (
	`name` varchar(100) NOT NULL,
	`schedule` varchar(64) NOT NULL,
	`expectedEveryMinutes` int NOT NULL,
	`lastStartedAt` datetime NOT NULL,
	`lastFinishedAt` datetime NOT NULL,
	`lastDurationMs` int NOT NULL DEFAULT 0,
	`lastStatus` enum('OK','FAILED') NOT NULL,
	`lastError` text,
	`runCount` int NOT NULL DEFAULT 0,
	`failCount` int NOT NULL DEFAULT 0,
	`lastFailedAt` datetime,
	CONSTRAINT `JobRun_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
ALTER TABLE `AuditLog` ADD `actorName` varchar(191);--> statement-breakpoint
ALTER TABLE `AuditLog` ADD `source` varchar(32);--> statement-breakpoint
CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog` (`createdAt`);--> statement-breakpoint
CREATE INDEX `AuditLog_actorId_createdAt_idx` ON `AuditLog` (`actorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `AuditLog_action_createdAt_idx` ON `AuditLog` (`action`,`createdAt`);--> statement-breakpoint
-- Older rows: fill in the actor's name and source from the account as it is today.
UPDATE `AuditLog` a JOIN `User` u ON u.`id` = a.`actorId` SET a.`actorName` = TRIM(CONCAT(u.`firstName`, ' ', COALESCE(u.`lastName`, ''))), a.`source` = 'APP' WHERE a.`actorName` IS NULL;
