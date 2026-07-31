-- 情绪气象站
CREATE TABLE IF NOT EXISTS mood_logs (
  id TEXT PRIMARY KEY,
  weather TEXT NOT NULL,   -- sunny | cloudy | rainy | stormy | snowy
  note TEXT,               -- 一句话原因（可选）
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mood_logs_created_at ON mood_logs(created_at);
