ALTER TABLE `ChecklistDefinition` ADD `responseMode` enum('SHARED','PER_DEPARTMENT','PER_USER') DEFAULT 'SHARED' NOT NULL;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `scopeKey` varchar(191) DEFAULT '' NOT NULL;--> statement-breakpoint
-- The new unique key goes in BEFORE the old one comes out: the definitionId foreign key needs an
-- index that starts with definitionId at every moment, and MariaDB refuses to drop the last one.
ALTER TABLE `ChecklistInstance` ADD CONSTRAINT `ChecklistInstance_definitionId_storeId_periodKey_scopeKey_key` UNIQUE(`definitionId`,`storeId`,`periodKey`,`scopeKey`);--> statement-breakpoint
ALTER TABLE `ChecklistInstance` DROP INDEX `ChecklistInstance_definitionId_storeId_periodKey_key`;
