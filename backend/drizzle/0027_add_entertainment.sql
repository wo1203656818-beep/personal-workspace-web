-- 娱乐功能
CREATE TABLE IF NOT EXISTS cyber_fortunes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  mood_score INTEGER,
  lucky_color TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_personas (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  lucky_color TEXT,
  bgm_style TEXT,
  suitable_for TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_inspirations (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenge_completions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  challenge TEXT NOT NULL,
  category TEXT NOT NULL,
  completed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tarot_readings (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  spread TEXT NOT NULL,
  cards TEXT NOT NULL,
  interpretation TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cyber_fortunes_date ON cyber_fortunes(date);
CREATE INDEX IF NOT EXISTS idx_daily_personas_date ON daily_personas(date);
CREATE INDEX IF NOT EXISTS idx_challenge_completions_date ON challenge_completions(date);
CREATE INDEX IF NOT EXISTS idx_tarot_readings_created_at ON tarot_readings(created_at);
