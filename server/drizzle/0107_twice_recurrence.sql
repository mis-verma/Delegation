ALTER TABLE `ChecklistDefinition` MODIFY COLUMN `recurrence` enum('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY','ONE_TIME','TWICE_WEEKLY','TWICE_MONTHLY') NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistInstance` MODIFY COLUMN `recurrence` enum('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY','ONE_TIME','TWICE_WEEKLY','TWICE_MONTHLY') NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistDefinition` ADD `occurrenceDays` json;
