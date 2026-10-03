CREATE INDEX `TaskChecklistItem_createdAt_idx` ON `TaskChecklistItem` (`createdAt`);--> statement-breakpoint
CREATE INDEX `Task_createdAt_idx` ON `Task` (`createdAt`);--> statement-breakpoint
CREATE INDEX `Ticket_closedAt_idx` ON `Ticket` (`closedAt`);--> statement-breakpoint
CREATE INDEX `Ticket_createdAt_idx` ON `Ticket` (`createdAt`);--> statement-breakpoint
CREATE INDEX `Ticket_storeId_closedAt_idx` ON `Ticket` (`storeId`,`closedAt`);--> statement-breakpoint
CREATE INDEX `Ticket_departmentId_closedAt_idx` ON `Ticket` (`departmentId`,`closedAt`);--> statement-breakpoint
CREATE INDEX `ChecklistInstance_storeId_periodStart_idx` ON `ChecklistInstance` (`storeId`,`periodStart`);