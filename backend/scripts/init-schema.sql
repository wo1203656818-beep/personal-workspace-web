CREATE TABLE IF NOT EXISTS `task_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#2563EB',
	`sort_order` integer DEFAULT 0,
	`is_system` integer DEFAULT false,
	`ms_todo_list_id` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `tasks` (
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

CREATE TABLE IF NOT EXISTS `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`is_completed` integer DEFAULT false,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `ima_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`content_html` text,
	`source_file` text,
	`imported_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `kb_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`file_type` text NOT NULL,
	`r2_key` text,
	`file_size` integer,
	`imported_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `coin_flips` (
	`id` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`entropy_source` text NOT NULL,
	`raw_value` integer,
	`interpretation` text,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS `embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`model` text NOT NULL,
	`vector` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `kv_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `answer_book_draws` (
	`id` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`entropy_source` text NOT NULL,
	`raw_value` integer,
	`interpretation` text,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `daily_fortunes` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`result` text NOT NULL,
	`entropy_source` text NOT NULL,
	`raw_value` integer,
	`interpretation` text,
	`created_at` text DEFAULT (datetime('now'))
);

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

CREATE INDEX IF NOT EXISTS `idx_tasks_created_at` ON `tasks` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_tasks_list_id_sort_order` ON `tasks` (`list_id`, `sort_order`);
CREATE INDEX IF NOT EXISTS `idx_tasks_my_day` ON `tasks` (`is_my_day`, `my_day_date`, `sort_order`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_tasks_important` ON `tasks` (`is_important`, `is_completed`, `sort_order`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_tasks_planned` ON `tasks` (`due_date`, `sort_order`);
CREATE INDEX IF NOT EXISTS `idx_tasks_ms_todo_deleted_at` ON `tasks` (`ms_todo_deleted_at`);
CREATE INDEX IF NOT EXISTS `idx_subtasks_task_id_sort_order` ON `subtasks` (`task_id`, `sort_order`);
CREATE INDEX IF NOT EXISTS `idx_ima_notes_updated_at` ON `ima_notes` (`updated_at`);
CREATE INDEX IF NOT EXISTS `idx_ima_notes_source_file` ON `ima_notes` (`source_file`);
CREATE INDEX IF NOT EXISTS `idx_kb_documents_updated_at` ON `kb_documents` (`updated_at`);
CREATE INDEX IF NOT EXISTS `idx_coin_flips_created_at` ON `coin_flips` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_ai_configs_is_default` ON `ai_configs` (`is_default`);
CREATE UNIQUE INDEX IF NOT EXISTS `embeddings_target_unique` ON `embeddings` (`target_type`, `target_id`);
