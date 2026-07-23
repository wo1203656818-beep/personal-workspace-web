-- 二级索引：加速按列表/MS ID/完成状态/日期等查询
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_id ON tasks(ms_todo_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_list_id ON tasks(ms_todo_list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_tasks_my_day_date ON tasks(my_day_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_deleted_at ON tasks(ms_todo_deleted_at);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_ima_notes_source_file ON ima_notes(source_file);
CREATE INDEX IF NOT EXISTS idx_kb_documents_file_type ON kb_documents(file_type);
CREATE INDEX IF NOT EXISTS idx_coin_flips_created_at ON coin_flips(created_at);
