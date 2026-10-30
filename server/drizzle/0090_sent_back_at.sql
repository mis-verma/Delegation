ALTER TABLE `ChecklistInstance` ADD `sentBackAt` datetime;--> statement-breakpoint
UPDATE `ChecklistInstance` SET `sentBackAt` = UTC_TIMESTAMP() WHERE `verificationStatus` = 'REJECTED';
