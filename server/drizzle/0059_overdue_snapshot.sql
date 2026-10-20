CREATE TABLE `OverdueSnapshot` (
	`id` varchar(191) NOT NULL,
	`day` varchar(10) NOT NULL,
	`kind` enum('TICKETS','DELEGATIONS') NOT NULL,
	`count` int NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `OverdueSnapshot_id` PRIMARY KEY(`id`),
	CONSTRAINT `OverdueSnapshot_day_kind_key` UNIQUE(`day`,`kind`)
);
