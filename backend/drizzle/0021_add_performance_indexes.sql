-- 性能索引：加速高频查询
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_my_day ON tasks(is_my_day, my_day_date);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_id ON tasks(ms_todo_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ms_todo_deleted ON tasks(ms_todo_deleted_at);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);

CREATE INDEX IF NOT EXISTS idx_feed_items_source_id ON feed_items(source_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_ai_score ON feed_items(ai_score);
CREATE INDEX IF NOT EXISTS idx_feed_items_category ON feed_items(category);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at);

CREATE INDEX IF NOT EXISTS idx_tag_relations_tag_id ON tag_relations(tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_relations_target ON tag_relations(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_monitor_snapshots_date ON monitor_snapshots(date, type);

CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON sync_logs(source);

CREATE INDEX IF NOT EXISTS idx_news_feedback_target ON news_feedback(target_type, target_id);
