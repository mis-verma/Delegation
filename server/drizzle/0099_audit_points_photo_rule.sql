ALTER TABLE `ChecklistDefinitionItem` ADD `accessoryPoints` json;
--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `auditPhotoOnlyOnMiss` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `auditPhotoOnlyOnMiss` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItemSubmissionAccessory` ADD `points` int DEFAULT 1 NOT NULL;
