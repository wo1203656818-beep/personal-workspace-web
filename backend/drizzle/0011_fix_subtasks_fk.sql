-- 修复 subtasks 外键指向错误
-- 根因：迁移 0004 重建 tasks 时执行了 `ALTER TABLE tasks RENAME TO tasks_old`，
-- SQLite 自动把 subtasks 的 `FOREIGN KEY (task_id) REFERENCES "tasks"` 改写成
-- `REFERENCES "tasks_old"`；随后 0004 又 `DROP TABLE tasks_old`，导致 subtasks 的
-- 外键悬空指向已删除的表。在 foreign_keys=ON 下，每次插入子任务都会触发
-- "no such table: tasks_old" / 外键校验失败 → Failed query → 500。
-- 本迁移重建 subtasks，把外键正确指回 tasks，并保留现有数据。

PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS `subtasks_fixed` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `title` text NOT NULL,
  `is_completed` integer DEFAULT false,
  `sort_order` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT INTO `subtasks_fixed` (`id`, `task_id`, `title`, `is_completed`, `sort_order`, `created_at`)
SELECT `id`, `task_id`, `title`, `is_completed`, `sort_order`, `created_at` FROM `subtasks`;

DROP TABLE `subtasks`;

ALTER TABLE `subtasks_fixed` RENAME TO `subtasks`;

PRAGMA foreign_keys=on;
