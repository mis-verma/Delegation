ALTER TABLE `ChecklistDefinitionItem` ADD `acceptableAnswers` json;--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `acceptableMin` float;--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `acceptableMax` float;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `acceptableAnswers` json;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `acceptableMin` float;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `acceptableMax` float;