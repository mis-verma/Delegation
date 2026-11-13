ALTER TABLE `PersonLeave` ADD `status` enum('PENDING','APPROVED','DECLINED') DEFAULT 'APPROVED' NOT NULL;
--> statement-breakpoint
ALTER TABLE `PersonLeave` ADD `decidedBy` varchar(191);
--> statement-breakpoint
ALTER TABLE `PersonLeave` ADD `decidedAt` datetime;
--> statement-breakpoint
ALTER TABLE `PersonLeave` ADD `declineNote` varchar(191);
--> statement-breakpoint
CREATE INDEX `PersonLeave_status_idx` ON `PersonLeave` (`status`);
