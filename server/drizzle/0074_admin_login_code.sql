ALTER TABLE `Settings` ADD `requireAdminLoginCode` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `PasswordOtp` MODIFY COLUMN `purpose` enum('SETUP','RESET','LOGIN') NOT NULL;