CREATE TABLE `PasswordOtp` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`purpose` enum('SETUP','RESET') NOT NULL,
	`codeHash` varchar(191) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` datetime NOT NULL,
	`usedAt` datetime,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `PasswordOtp_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `PasswordOtp` ADD CONSTRAINT `PasswordOtp_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `PasswordOtp_userId_createdAt_idx` ON `PasswordOtp` (`userId`,`createdAt`);