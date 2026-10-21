ALTER TABLE `Task` ADD `approvalReminderSentAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD `approvalEscalatedAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD `overdueEscalatedAt` datetime;--> statement-breakpoint
ALTER TABLE `Task` ADD `unassignedNotifiedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `approvalReminderSentAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `approvalEscalatedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `overdueEscalatedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `unassignedNotifiedAt` datetime;