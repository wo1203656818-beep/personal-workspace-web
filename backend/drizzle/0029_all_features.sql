-- 日记/日志
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  mood TEXT,
  tags TEXT,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);

-- 倒数日：增加年重复标志
ALTER TABLE countdowns ADD COLUMN is_yearly INTEGER NOT NULL DEFAULT 0;

-- 收藏链接：增加阅读进度字段
ALTER TABLE bookmarks ADD COLUMN progress INTEGER DEFAULT 0;

-- 收藏链接：增加阅读笔记字段
ALTER TABLE bookmarks ADD COLUMN reading_note TEXT;