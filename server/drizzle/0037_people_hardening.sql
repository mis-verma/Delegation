ALTER TABLE `User` ADD `passwordChangedAt` datetime;--> statement-breakpoint
ALTER TABLE `User` ADD `deactivatedAt` datetime;--> statement-breakpoint
CREATE INDEX `User_role_isActive_idx` ON `User` (`role`,`isActive`);