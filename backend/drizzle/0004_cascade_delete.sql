-- 重建 tasks 表，将 list_id 外键改 ON DELETE CASCADE
-- SQLite 不支持 ALTER TABLE 改外键，需重建表
-- 列顺序与 0000+0002 后的实际顺序一致（ms_todo_deleted_at 在末尾）
-- 注意：D1 远程不支持 SQL 显式事务，故省略

PRAGMA foreign_keys=off;

ALTER TABLE tasks RENAME TO tasks_old;

CREATE TABLE `tasks` (
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
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	`ms_todo_deleted_at` text,
	FOREIGN KEY (`list_id`) REFERENCES `task_lists`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT INTO `tasks` (
	`id`, `list_id`, `title`, `note`, `is_completed`, `is_important`, `is_my_day`,
	`my_day_date`, `due_date`, `reminder`, `recurrence`, `sort_order`,
	`ms_todo_id`, `ms_todo_list_id`, `last_synced_at`,
	`created_at`, `updated_at`, `ms_todo_deleted_at`
)
SELECT
	`id`, `list_id`, `title`, `note`, `is_completed`, `is_important`, `is_my_day`,
	`my_day_date`, `due_date`, `reminder`, `recurrence`, `sort_order`,
	`ms_todo_id`, `ms_todo_list_id`, `last_synced_at`,
	`created_at`, `updated_at`, `ms_todo_deleted_at`
FROM tasks_old;

DROP TABLE tasks_old;

-- 重建 subtasks，修正被 RENAME 自动改写的外键（tasks -> tasks_old）
-- SQLite 在 ALTER TABLE ... RENAME 时会自动把其他表里的 REFERENCES "tasks" 改写为
-- "tasks_old"，而上面已 DROP tasks_old，故需在此把 subtasks 外键指回新的 tasks。
CREATE TABLE IF NOT EXISTS `subtasks_new` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `title` text NOT NULL,
  `is_completed` integer DEFAULT false,
  `sort_order` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO `subtasks_new` (`id`, `task_id`, `title`, `is_completed`, `sort_order`, `created_at`)
SELECT `id`, `task_id`, `title`, `is_completed`, `sort_order`, `created_at` FROM `subtasks`;
DROP TABLE `subtasks`;
ALTER TABLE `subtasks_new` RENAME TO `subtasks`;

PRAGMA foreign_keys=on;
