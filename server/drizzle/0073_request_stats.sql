CREATE TABLE `RequestStat` (
	`minute` datetime NOT NULL,
	`workerId` int NOT NULL,
	`requests` int NOT NULL DEFAULT 0,
	`totalMs` int NOT NULL DEFAULT 0,
	`maxMs` int NOT NULL DEFAULT 0,
	`under100` int NOT NULL DEFAULT 0,
	`under300` int NOT NULL DEFAULT 0,
	`under1000` int NOT NULL DEFAULT 0,
	`under3000` int NOT NULL DEFAULT 0,
	`over3000` int NOT NULL DEFAULT 0,
	`serverErrors` int NOT NULL DEFAULT 0,
	CONSTRAINT `RequestStat_minute_workerId_pk` PRIMARY KEY(`minute`,`workerId`)
);