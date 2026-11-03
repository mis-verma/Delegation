ALTER TABLE `TaskImage` ADD `qualityFlags` varchar(64);
--> statement-breakpoint
ALTER TABLE `TaskImage` ADD `reviewStatus` enum('NONE','REJECTED','ACCEPTED') DEFAULT 'NONE' NOT NULL;
--> statement-breakpoint
ALTER TABLE `TaskImage` ADD `reviewReason` varchar(32);
--> statement-breakpoint
ALTER TABLE `TaskImage` ADD `reviewedBy` varchar(191);
--> statement-breakpoint
ALTER TABLE `TaskImage` ADD `reviewedAt` datetime;
--> statement-breakpoint
ALTER TABLE `ChecklistImage` ADD `qualityFlags` varchar(64);
--> statement-breakpoint
ALTER TABLE `ChecklistImage` ADD `reviewStatus` enum('NONE','REJECTED','ACCEPTED') DEFAULT 'NONE' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistImage` ADD `reviewReason` varchar(32);
--> statement-breakpoint
ALTER TABLE `ChecklistImage` ADD `reviewedBy` varchar(191);
--> statement-breakpoint
ALTER TABLE `ChecklistImage` ADD `reviewedAt` datetime;