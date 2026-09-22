CREATE TABLE `TaskReviewer` (
	`id` varchar(191) NOT NULL,
	`taskId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `TaskReviewer_id` PRIMARY KEY(`id`),
	CONSTRAINT `TaskReviewer_taskId_userId_key` UNIQUE(`taskId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `TicketReviewer` (
	`id` varchar(191) NOT NULL,
	`ticketId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `TicketReviewer_id` PRIMARY KEY(`id`),
	CONSTRAINT `TicketReviewer_ticketId_userId_key` UNIQUE(`ticketId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `User` MODIFY COLUMN `role` enum('ADMIN','APPROVAL_MANAGER','SENIOR','MANAGER','AGENT','USER','PC') NOT NULL DEFAULT 'USER';--> statement-breakpoint
ALTER TABLE `TaskStatusUpdate` MODIFY COLUMN `fromStatus` enum('draft','todo','in_progress','pending_verification','pending_approval','done') NOT NULL;--> statement-breakpoint
ALTER TABLE `TaskStatusUpdate` MODIFY COLUMN `toStatus` enum('draft','todo','in_progress','pending_verification','pending_approval','done') NOT NULL;--> statement-breakpoint
ALTER TABLE `Task` MODIFY COLUMN `status` enum('draft','todo','in_progress','pending_verification','pending_approval','done') NOT NULL DEFAULT 'todo';--> statement-breakpoint
ALTER TABLE `Ticket` MODIFY COLUMN `status` enum('OPEN','IN_PROGRESS','IN_REVIEW','PENDING_APPROVAL','CLOSED','ON_HOLD') NOT NULL DEFAULT 'OPEN';--> statement-breakpoint
ALTER TABLE `ChecklistInstance` MODIFY COLUMN `verificationStatus` enum('NOT_SUBMITTED','PENDING','PENDING_APPROVAL','APPROVED','REJECTED') NOT NULL DEFAULT 'NOT_SUBMITTED';--> statement-breakpoint
ALTER TABLE `Settings` ADD `maintenanceMode` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `Settings` ADD `maintenanceMessage` varchar(500);--> statement-breakpoint
ALTER TABLE `TaskReviewer` ADD CONSTRAINT `TaskReviewer_taskId_Task_id_fk` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TaskReviewer` ADD CONSTRAINT `TaskReviewer_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TicketReviewer` ADD CONSTRAINT `TicketReviewer_ticketId_Ticket_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TicketReviewer` ADD CONSTRAINT `TicketReviewer_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `TaskReviewer_userId_idx` ON `TaskReviewer` (`userId`);--> statement-breakpoint
CREATE INDEX `TicketReviewer_userId_idx` ON `TicketReviewer` (`userId`);