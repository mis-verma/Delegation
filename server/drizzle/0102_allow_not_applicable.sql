ALTER TABLE `ChecklistDefinitionItem` ADD `allowNotApplicable` boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `allowNotApplicable` boolean DEFAULT true NOT NULL;
