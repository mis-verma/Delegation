CREATE INDEX `Ticket_tatDueAt_idx` ON `Ticket` (`tatDueAt`);--> statement-breakpoint
CREATE INDEX `Ticket_isOverdue_tatDueAt_idx` ON `Ticket` (`isOverdue`,`tatDueAt`);--> statement-breakpoint
CREATE INDEX `TicketStatusUpdate_toStatus_createdAt_idx` ON `TicketStatusUpdate` (`toStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Task_dueDate_idx` ON `Task` (`dueDate`);--> statement-breakpoint
CREATE INDEX `Task_submittedAt_idx` ON `Task` (`submittedAt`);--> statement-breakpoint
CREATE INDEX `Notification_recipientId_createdAt_idx` ON `Notification` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Notification_recipientId_isRead_idx` ON `Notification` (`recipientId`,`isRead`);
