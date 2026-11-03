ALTER TABLE `ChecklistInstanceImage` ADD `reviewStatus` enum('NONE','REJECTED','ACCEPTED') DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceImage` ADD `reviewReason` varchar(32);--> statement-breakpoint
ALTER TABLE `ChecklistInstanceImage` ADD `reviewedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `ChecklistInstanceImage` ADD `reviewedAt` datetime;
