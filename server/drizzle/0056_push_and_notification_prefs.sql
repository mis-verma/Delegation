CREATE TABLE `NotificationPreference` (
	`userId` varchar(191) NOT NULL,
	`quietStart` varchar(5),
	`quietEnd` varchar(5),
	`morningDigest` boolean NOT NULL DEFAULT false,
	`lastDigestOn` varchar(10),
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `NotificationPreference_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `PushSubscription` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`endpointHash` varchar(64) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`userAgent` varchar(255),
	`createdAt` datetime NOT NULL,
	`lastUsedAt` datetime,
	CONSTRAINT `PushSubscription_id` PRIMARY KEY(`id`),
	CONSTRAINT `PushSubscription_endpointHash_key` UNIQUE(`endpointHash`)
);
--> statement-breakpoint
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `PushSubscription_userId_idx` ON `PushSubscription` (`userId`);