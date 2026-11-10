ALTER TABLE `ChecklistDefinitionItem` ADD `criticalAccessories` json;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItemSubmissionAccessory` ADD `isCritical` boolean DEFAULT false NOT NULL;
