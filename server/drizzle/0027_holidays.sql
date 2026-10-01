CREATE TABLE `Holiday` (
	`id` varchar(191) NOT NULL,
	`date` varchar(10) NOT NULL,
	`name` varchar(191) NOT NULL,
	`createdBy` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	`updatedAt` datetime NOT NULL,
	CONSTRAINT `Holiday_id` PRIMARY KEY(`id`),
	CONSTRAINT `Holiday_date_key` UNIQUE(`date`)
);
