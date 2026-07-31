-- 行动承诺系统
ALTER TABLE tasks ADD COLUMN status TEXT DEFAULT 'planned';
ALTER TABLE tasks ADD COLUMN why TEXT;
ALTER TABLE tasks ADD COLUMN first_step TEXT;
ALTER TABLE tasks ADD COLUMN started_at TEXT;
ALTER TABLE tasks ADD COLUMN abandoned_at TEXT;

-- 决策规则库
CREATE TABLE IF NOT EXISTS decision_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  condition TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 性能索引
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
