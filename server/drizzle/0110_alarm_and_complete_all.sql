ALTER TABLE `Department` ADD `alarmReminders` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `User` ADD `canCompleteAll` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceAssignee` ADD `alarmRungAt` datetime;
--> statement-breakpoint
ALTER TABLE `ChecklistInstanceAssignee` ADD `alarmSnoozedUntil` datetime;
