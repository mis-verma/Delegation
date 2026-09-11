DROP TABLE `TaskReview`;--> statement-breakpoint
CREATE INDEX `Todo_userId_idx` ON `Todo` (`userId`);--> statement-breakpoint
CREATE INDEX `Ticket_storeId_createdAt_idx` ON `Ticket` (`storeId`,`createdAt`);