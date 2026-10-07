ALTER TABLE `ChecklistInstanceItem` ADD `waivedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `waivedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `waiveReason` text;