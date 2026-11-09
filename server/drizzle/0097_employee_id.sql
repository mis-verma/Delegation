ALTER TABLE `Settings` ADD `employeeIdPrefix` varchar(16) DEFAULT 'EMP' NOT NULL;
--> statement-breakpoint
ALTER TABLE `Settings` ADD `employeeIdNext` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE `Settings` SET `employeeIdPrefix` = 'VJ' WHERE `orgName` LIKE '%Verma%';
--> statement-breakpoint
ALTER TABLE `User` ADD `employeeId` varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_employeeId_key` ON `User` (`employeeId`);
