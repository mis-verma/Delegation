ALTER TABLE `Settings` ADD `auditRetentionDays` int DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE `Settings` ADD `notificationRetentionDays` int DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `Settings` ADD `inboundMessageRetentionDays` int DEFAULT 7 NOT NULL;