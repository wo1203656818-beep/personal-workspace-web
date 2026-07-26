-- 重建索引：migration 0010 重建 tasks 表（DROP TABLE → ALTER RENAME）导致
-- 0003 和 0009 中创建的 tasks 表索引全部丢失，所有任务查询退化为全表扫描。
-- 本迁移重建所有丢失的 tasks 和 subtasks 索引。

-- tasks 表索引（来自 0003）
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_id ON tasks(ms_todo_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_list_id ON tasks(ms_todo_list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_tasks_my_day_date ON tasks(my_day_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_deleted_at ON tasks(ms_todo_deleted_at);

-- tasks 表索引（来自 0009）
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_list_id_sort_order ON tasks(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_my_day ON tasks(is_my_day, my_day_date, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_important ON tasks(is_important, is_completed, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_planned ON tasks(due_date, sort_order);

-- subtasks 表索引（来自 0003/0009，0011 重建表时也会丢失）
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id_sort_order ON subtasks(task_id, sort_order);
