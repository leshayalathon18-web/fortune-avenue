CREATE TABLE `fortune_room_sessions` (
	`room_code` text NOT NULL,
	`player_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`joined_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	PRIMARY KEY(`room_code`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_fortune_sessions_last_seen` ON `fortune_room_sessions` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `fortune_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fortune_rooms_updated_at` ON `fortune_rooms` (`updated_at`);