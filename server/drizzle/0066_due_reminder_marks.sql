ALTER TABLE `Task` ADD `overdueNotifiedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `dueSoonNotifiedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `overdueNotifiedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `dueSoonNotifiedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `upcomingNotifiedAt` datetime;