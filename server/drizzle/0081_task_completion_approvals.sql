ALTER TABLE `TaskDepartmentApproval` ADD `completionStatus` enum('none','pending','approved') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `TaskDepartmentApproval` ADD `completionBy` varchar(191);--> statement-breakpoint
ALTER TABLE `TaskDepartmentApproval` ADD `completionAt` datetime;--> statement-breakpoint
ALTER TABLE `TaskDepartmentApproval` ADD CONSTRAINT `TaskDepartmentApproval_completionBy_User_id_fk` FOREIGN KEY (`completionBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
