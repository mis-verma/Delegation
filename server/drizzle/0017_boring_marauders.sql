ALTER TABLE `Settings` ADD `accessTokenExpiresMinutes` int DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `Settings` ADD `refreshTokenExpiresDays` int DEFAULT 30 NOT NULL;