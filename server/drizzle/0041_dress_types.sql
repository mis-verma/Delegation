CREATE TABLE `DressType` (
	`id` varchar(191) NOT NULL,
	`name` varchar(80) NOT NULL,
	`gender` enum('FEMALE','MALE'),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` datetime NOT NULL,
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `DressType_id` PRIMARY KEY(`id`),
	CONSTRAINT `DressType_name_key` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `User` ADD `dressTypeId` varchar(191);--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` ADD `accessoriesByType` json;--> statement-breakpoint
ALTER TABLE `User` ADD CONSTRAINT `User_dressTypeId_DressType_id_fk` FOREIGN KEY (`dressTypeId`) REFERENCES `DressType`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hand-written data migration (0040's dressCode / accessoriesFemaleSaree become real dress types).
-- Fixed ids on purpose: plain SQL has no cuid, and a session variable would not survive between statements.
INSERT INTO `DressType` (`id`, `name`, `gender`, `isActive`, `createdAt`, `updatedAt`)
SELECT 'dresstype_migrated_saree', 'Saree', 'FEMALE', true, NOW(), NOW() FROM DUAL
WHERE EXISTS (SELECT 1 FROM `User` WHERE `dressCode` = 'SAREE')
   OR EXISTS (SELECT 1 FROM `ChecklistDefinitionItem` WHERE JSON_TYPE(`accessoriesFemaleSaree`) = 'ARRAY' AND JSON_LENGTH(`accessoriesFemaleSaree`) > 0);--> statement-breakpoint
INSERT INTO `DressType` (`id`, `name`, `gender`, `isActive`, `createdAt`, `updatedAt`)
SELECT 'dresstype_migrated_western', 'Coat, pant and heels', 'FEMALE', true, NOW(), NOW() FROM DUAL
WHERE EXISTS (SELECT 1 FROM `User` WHERE `dressCode` = 'WESTERN');--> statement-breakpoint
UPDATE `User` SET `dressTypeId` = 'dresstype_migrated_saree' WHERE `dressCode` = 'SAREE';--> statement-breakpoint
UPDATE `User` SET `dressTypeId` = 'dresstype_migrated_western' WHERE `dressCode` = 'WESTERN';--> statement-breakpoint
UPDATE `ChecklistDefinitionItem` SET `accessoriesByType` = JSON_OBJECT('dresstype_migrated_saree', `accessoriesFemaleSaree`)
WHERE JSON_TYPE(`accessoriesFemaleSaree`) = 'ARRAY' AND JSON_LENGTH(`accessoriesFemaleSaree`) > 0;--> statement-breakpoint
ALTER TABLE `User` DROP COLUMN `dressCode`;--> statement-breakpoint
ALTER TABLE `ChecklistDefinitionItem` DROP COLUMN `accessoriesFemaleSaree`;
