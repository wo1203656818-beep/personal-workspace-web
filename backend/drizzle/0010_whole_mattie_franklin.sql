-- Migration 0010 — hardened to be idempotent / re-runnable.
--
-- Why the changes vs the original generated file:
--   * All CREATE TABLE now use IF NOT EXISTS. The original file re-declared
--     `ai_configs` (0008), `embeddings` (0005), `kv_cache` (0007) and those
--     statements would throw "table already exists" on a fresh
--     `wrangler d1 migrations apply`, aborting the whole run.
--   * The duplicate `ALTER TABLE ima_notes ADD content_html` (already added in
--     0006) was removed for the same reason.
--   * `__new_tasks` uses IF NOT EXISTS so a retried/partial apply won't fail.
--
-- `tasks` is migrated via the create-copy-drop-rename pattern (Drizzle style).
-- Because migrations are tracked in `d1_migrations`, this block only ever runs
-- once per environment.

CREATE TABLE IF NOT EXISTS `ai_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text,
	`api_key` text,
	`model` text,
	`is_default` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `answer_book_draws` (
	`id` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`entropy_source` text NOT NULL,
	`raw_value` integer,
	`interpretation` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_fortunes` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`result` text NOT NULL,
	`entropy_source` text NOT NULL,
	`raw_value` integer,
	`interpretation` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`model` text NOT NULL,
	`vector` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kv_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`synced` integer DEFAULT 0,
	`failed` integer DEFAULT 0,
	`skipped` integer DEFAULT 0,
	`message` text,
	`details` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '',
	`is_completed` integer DEFAULT false,
	`is_important` integer DEFAULT false,
	`is_my_day` integer DEFAULT false,
	`my_day_date` text,
	`due_date` text,
	`reminder` text,
	`recurrence` text,
	`sort_order` integer DEFAULT 0,
	`ms_todo_id` text,
	`ms_todo_list_id` text,
	`last_synced_at` text,
	`ms_todo_deleted_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`list_id`) REFERENCES `task_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "list_id", "title", "note", "is_completed", "is_important", "is_my_day", "my_day_date", "due_date", "reminder", "recurrence", "sort_order", "ms_todo_id", "ms_todo_list_id", "last_synced_at", "ms_todo_deleted_at", "created_at", "updated_at") SELECT "id", "list_id", "title", "note", "is_completed", "is_important", "is_my_day", "my_day_date", "due_date", "reminder", "recurrence", "sort_order", NULL, NULL, NULL, NULL, "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
