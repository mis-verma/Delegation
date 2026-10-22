ALTER TABLE `Ticket` ADD `headReminderSentAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `headEscalatedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `staleNudgeSentAt` datetime;