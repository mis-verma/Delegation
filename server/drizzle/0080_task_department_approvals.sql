CREATE TABLE `TaskDepartmentApproval` (
	`id` varchar(191) NOT NULL,
	`taskId` varchar(191) NOT NULL,
	`departmentId` varchar(191) NOT NULL,
	`status` enum('pending','approved') NOT NULL DEFAULT 'pending',
	`decidedBy` varchar(191),
	`decidedAt` datetime,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `TaskDepartmentApproval_id` PRIMARY KEY(`id`),
	CONSTRAINT `TaskDepartmentApproval_taskId_departmentId_key` UNIQUE(`taskId`,`departmentId`)
);--> statement-breakpoint
ALTER TABLE `TaskDepartmentApproval` ADD CONSTRAINT `TaskDepartmentApproval_taskId_Task_id_fk` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TaskDepartmentApproval` ADD CONSTRAINT `TaskDepartmentApproval_departmentId_Department_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TaskDepartmentApproval` ADD CONSTRAINT `TaskDepartmentApproval_decidedBy_User_id_fk` FOREIGN KEY (`decidedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `TaskDepartmentApproval_departmentId_status_idx` ON `TaskDepartmentApproval` (`departmentId`,`status`);--> statement-breakpoint
INSERT INTO `TaskDepartmentApproval` (`id`, `taskId`, `departmentId`, `status`, `createdAt`) SELECT UUID(), `id`, `departmentId`, 'pending', NOW() FROM `Task` WHERE `awaitingHeadApproval` = 1 AND `departmentId` IS NOT NULL AND `deletedAt` IS NULL;
