-- 性能优化索引：补充 ORDER BY 与常用过滤字段
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
