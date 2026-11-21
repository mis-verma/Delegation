ALTER TABLE `ChecklistDefinitionItem` MODIFY COLUMN `label` text NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` MODIFY COLUMN `label` text NOT NULL;
