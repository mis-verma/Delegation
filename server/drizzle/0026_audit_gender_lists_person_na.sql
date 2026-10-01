ALTER TABLE `User` ADD `gender` enum('FEMALE','MALE');--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `accessoriesFemale` json;--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `accessoriesMale` json;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItemSubmission` ADD `isNotApplicable` boolean DEFAULT false NOT NULL;