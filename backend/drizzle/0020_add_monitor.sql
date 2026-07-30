-- Layer A: 自媒体对标监控模块
CREATE TABLE IF NOT EXISTS monitor_targets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  target_id TEXT,
  keyword TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS monitor_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  target_id TEXT,
  items TEXT NOT NULL,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS monitor_briefs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  pushed_at TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitor_targets_type ON monitor_targets(type);
CREATE INDEX IF NOT EXISTS idx_monitor_snapshots_date ON monitor_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_monitor_briefs_date ON monitor_briefs(date);
