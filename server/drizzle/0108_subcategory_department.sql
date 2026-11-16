ALTER TABLE `CategorySubcategory` ADD `departmentId` varchar(191);
--> statement-breakpoint
ALTER TABLE `CategorySubcategory` ADD CONSTRAINT `CategorySubcategory_departmentId_Department_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE set null ON UPDATE no action;
