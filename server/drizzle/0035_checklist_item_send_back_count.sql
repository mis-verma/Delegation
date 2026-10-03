ALTER TABLE `ChecklistInstanceItem` ADD `sendBackCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `sentBackFrom` varchar(191);