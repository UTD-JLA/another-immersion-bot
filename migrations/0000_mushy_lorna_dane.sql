CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text,
	`date` integer NOT NULL,
	`duration` integer NOT NULL,
	`raw_duration` integer,
	`raw_duration_unit` text,
	`speed` integer
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags_to_activities` (
	`tag_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	PRIMARY KEY(`activity_id`, `tag_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `guild_configs` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`time_zone` text
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`language` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_configs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`time_zone` text,
	`reading_speed` integer,
	`reading_speed_pages` integer,
	`daily_goal` integer
);
--> statement-breakpoint
CREATE INDEX `user_id_index` ON `activities` (`user_id`);--> statement-breakpoint
CREATE INDEX `date_index` ON `activities` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `name_index` ON `tags` (`name`);