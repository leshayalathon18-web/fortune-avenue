CREATE TABLE `fortune_profile_games` (
	`room_code` text NOT NULL,
	`player_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`winner` integer DEFAULT 0 NOT NULL,
	`final_fortune` integer NOT NULL,
	`recorded_at` text NOT NULL,
	PRIMARY KEY(`room_code`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_fortune_profile_games_profile` ON `fortune_profile_games` (`profile_id`);--> statement-breakpoint
CREATE TABLE `fortune_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`favorite_pawn_slug` text NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`biggest_fortune` integer DEFAULT 0 NOT NULL,
	`districts_completed` integer DEFAULT 0 NOT NULL,
	`castles_built` integer DEFAULT 0 NOT NULL,
	`achievements_json` text DEFAULT '[]' NOT NULL,
	`pawn_usage_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `fortune_room_sessions` ADD `role` text DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE `fortune_room_sessions` ADD `profile_id` text;