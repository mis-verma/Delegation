CREATE TABLE `ProcessedInboundMessage` (
	`id` varchar(191) NOT NULL,
	`channel` enum('whatsapp','doubletick') NOT NULL,
	`messageId` varchar(191) NOT NULL,
	`createdAt` datetime NOT NULL,
	CONSTRAINT `ProcessedInboundMessage_id` PRIMARY KEY(`id`),
	CONSTRAINT `ProcessedInboundMessage_channel_messageId_key` UNIQUE(`channel`,`messageId`)
);
