ALTER TABLE `ChecklistInstanceImage` ADD `contentHash` varchar(32);--> statement-breakpoint
ALTER TABLE `ChecklistInstanceImage` ADD `takenAt` datetime;--> statement-breakpoint
CREATE INDEX `ChecklistInstanceImage_contentHash_idx` ON `ChecklistInstanceImage` (`contentHash`);
