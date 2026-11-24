ALTER TABLE `ChecklistDefinition` ADD `scoringMode` enum('RULE','POINTS') NOT NULL DEFAULT 'RULE';
--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `scoringMode` enum('RULE','POINTS') NOT NULL DEFAULT 'RULE';
--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `floor` varchar(120);
--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `sectionOwnerId` varchar(191);
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `floor` varchar(120);
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `sectionOwnerId` varchar(191);
--> statement-breakpoint
CREATE INDEX `ChecklistInstanceItem_floor_idx` ON `ChecklistInstanceItem` (`instanceId`,`floor`);
